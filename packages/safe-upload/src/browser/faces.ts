import { ctx2d, makeCanvas } from './canvas.js';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceBox extends Box {
  score: number;
}

export interface FaceDetectionOptions {
  /** URL of the folder holding MediaPipe's vision_wasm_internal.{js,wasm} (self-host it). */
  wasmBaseUrl: string;
  /** URL of a BlazeFace .tflite model, e.g. blaze_face_full_range.tflite (self-host it). */
  modelAssetUrl: string;
  /** Minimum detection confidence, 0..1. Default 0.4 (favours recall: a missed face is worse). */
  minScore?: number;
}

type Detector = { detect(image: unknown): { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number }; categories: { score: number }[] }[] }; close(): void };

let cached: { key: string; detector: Promise<Detector> } | undefined;

/** MediaPipe needs WebGL even on its CPU path. False when the browser has WebGL turned off. */
export function faceDetectionSupported(): boolean {
  try {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class FaceDetectionUnavailableError extends Error {
  constructor() {
    super('Face detection needs WebGL, which is turned off in this browser.');
    this.name = 'FaceDetectionUnavailableError';
  }
}

async function getDetector(o: FaceDetectionOptions): Promise<Detector> {
  const key = `${o.wasmBaseUrl}|${o.modelAssetUrl}|${o.minScore ?? 0.4}`;
  if (cached?.key === key) return cached.detector;
  if (!faceDetectionSupported()) throw new FaceDetectionUnavailableError();
  const detector = (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(o.wasmBaseUrl);
    return (await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: o.modelAssetUrl, delegate: 'CPU' },
      runningMode: 'IMAGE',
      minDetectionConfidence: o.minScore ?? 0.4,
      minSuppressionThreshold: 0.3,
    })) as unknown as Detector;
  })();
  cached = { key, detector };
  detector.catch(() => (cached = undefined));
  return detector;
}

/** Load the detector ahead of time (downloads the WASM runtime and model). */
export async function preloadFaceDetector(o: FaceDetectionOptions): Promise<void> {
  await getDetector(o);
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/** Overlap relative to the smaller box, to merge a face found whole and again in a tile. */
function containment(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / Math.min(a.width * a.height, b.width * b.height);
}

/**
 * Find faces on-device. Runs the detector on the whole picture and on overlapping tiles so that
 * small faces in large group photos are found too. Coordinates are in the source's pixel space.
 */
export async function detectFaces(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement, options: FaceDetectionOptions): Promise<FaceBox[]> {
  const det = await getDetector(options);
  const W = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const H = 'naturalHeight' in source ? source.naturalHeight : source.height;
  const MAX = 1024;
  const found: FaceBox[] = [];

  const run = (sx: number, sy: number, sw: number, sh: number) => {
    const scale = Math.min(1, MAX / Math.max(sw, sh));
    const cw = Math.max(1, Math.round(sw * scale));
    const ch = Math.max(1, Math.round(sh * scale));
    const canvas = makeCanvas(cw, ch);
    const ctx = ctx2d(canvas);
    ctx.drawImage(source as CanvasImageSource, sx, sy, sw, sh, 0, 0, cw, ch);
    // Raw pixels go straight into WASM memory, so detection works without WebGL.
    const res = det.detect(ctx.getImageData(0, 0, cw, ch));
    for (const d of res.detections) {
      const bb = d.boundingBox;
      if (!bb) continue;
      found.push({
        x: sx + bb.originX / scale,
        y: sy + bb.originY / scale,
        width: bb.width / scale,
        height: bb.height / scale,
        score: d.categories[0]?.score ?? 0,
      });
    }
  };

  run(0, 0, W, H);
  const longest = Math.max(W, H);
  const grids = longest > 2400 ? [2, 3] : longest > 1000 ? [2] : [];
  for (const n of grids) {
    const tw = W / n;
    const th = H / n;
    const ox = tw * 0.25;
    const oy = th * 0.25;
    for (let gy = 0; gy < n; gy++)
      for (let gx = 0; gx < n; gx++) {
        const sx = Math.max(0, gx * tw - ox);
        const sy = Math.max(0, gy * th - oy);
        run(sx, sy, Math.min(W - sx, tw + 2 * ox), Math.min(H - sy, th + 2 * oy));
      }
  }

  // Merge duplicates, keeping the higher score.
  found.sort((a, b) => b.score - a.score);
  const kept: FaceBox[] = [];
  for (const f of found) if (!kept.some((k) => iou(k, f) > 0.3 || containment(k, f) > 0.6)) kept.push(f);
  return kept.map((f) => ({ ...f, x: Math.max(0, f.x), y: Math.max(0, f.y), width: Math.min(f.width, W - Math.max(0, f.x)), height: Math.min(f.height, H - Math.max(0, f.y)) }));
}

/** Grow a box by a fraction on each side (faces need margin for hair and ears). */
export function pad(b: Box, fraction: number, maxW: number, maxH: number): Box {
  const dx = b.width * fraction;
  const dy = b.height * fraction;
  const x = Math.max(0, b.x - dx);
  const y = Math.max(0, b.y - dy * 1.4);
  return { x, y, width: Math.min(maxW - x, b.width + 2 * dx), height: Math.min(maxH - y, b.height + dy * 2.4) };
}
