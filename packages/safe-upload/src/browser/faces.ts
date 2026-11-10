import { ctx2d, makeCanvas } from './canvas.js';
import { containment, iou, loadVision, sizeOf, tiles, visionSupported, VisionUnavailableError, type Box } from './mediapipe.js';

export type { Box };

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

type Detector = { detect(image: unknown): { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number }; categories: { score: number }[] }[] } };

let cached: { key: string; detector: Promise<Detector> } | undefined;

/** @deprecated use visionSupported */
export const faceDetectionSupported = visionSupported;
export { VisionUnavailableError as FaceDetectionUnavailableError };

async function getDetector(o: FaceDetectionOptions): Promise<Detector> {
  const key = `${o.wasmBaseUrl}|${o.modelAssetUrl}|${o.minScore ?? 0.4}`;
  if (cached?.key === key) return cached.detector;
  const detector = (async () => {
    const { vision, fileset } = await loadVision(o.wasmBaseUrl);
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

/**
 * Find faces on-device. Runs on the whole picture and on overlapping tiles so small faces in
 * large group photos are found too. Coordinates are in the source's pixel space.
 */
export async function detectFaces(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement, options: FaceDetectionOptions): Promise<FaceBox[]> {
  const det = await getDetector(options);
  const { W, H } = sizeOf(source);
  const found: FaceBox[] = [];
  for (const t of tiles(W, H)) {
    const scale = Math.min(1, 1024 / Math.max(t.width, t.height));
    const cw = Math.max(1, Math.round(t.width * scale));
    const ch = Math.max(1, Math.round(t.height * scale));
    const ctx = ctx2d(makeCanvas(cw, ch));
    ctx.drawImage(source as CanvasImageSource, t.x, t.y, t.width, t.height, 0, 0, cw, ch);
    // Raw pixels go straight into WASM memory.
    for (const d of det.detect(ctx.getImageData(0, 0, cw, ch)).detections) {
      const bb = d.boundingBox;
      if (bb) found.push({ x: t.x + bb.originX / scale, y: t.y + bb.originY / scale, width: bb.width / scale, height: bb.height / scale, score: d.categories[0]?.score ?? 0 });
    }
  }
  found.sort((a, b) => b.score - a.score);
  const kept: FaceBox[] = [];
  for (const f of found) if (!kept.some((k) => iou(k, f) > 0.3 || containment(k, f) > 0.6)) kept.push(f);
  return kept.map((f) => clampBox(f, W, H));
}

export function clampBox<T extends Box>(b: T, W: number, H: number): T {
  const x = Math.max(0, b.x);
  const y = Math.max(0, b.y);
  return { ...b, x, y, width: Math.min(b.width - (x - b.x), W - x), height: Math.min(b.height - (y - b.y), H - y) };
}

/** Grow a box by a fraction on each side (faces need margin for hair and ears). */
export function pad(b: Box, fraction: number, maxW: number, maxH: number): Box {
  const dx = b.width * fraction;
  const dy = b.height * fraction;
  const x = Math.max(0, b.x - dx);
  const y = Math.max(0, b.y - dy * 1.4);
  return { x, y, width: Math.min(maxW - x, b.width + 2 * dx), height: Math.min(maxH - y, b.height + dy * 2.4) };
}
