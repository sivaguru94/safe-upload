/** Loads MediaPipe's vision module and WASM runtime once, shared by face and object detection. */
type Vision = typeof import('@mediapipe/tasks-vision');
type Fileset = Awaited<ReturnType<Vision['FilesetResolver']['forVisionTasks']>>;

let cache: { base: string; promise: Promise<{ vision: Vision; fileset: Fileset }> } | undefined;

/** MediaPipe needs WebGL even on its CPU path. False when the browser has WebGL turned off. */
export function visionSupported(): boolean {
  try {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export class VisionUnavailableError extends Error {
  constructor() {
    super('On-device detection needs WebGL, which is turned off in this browser.');
    this.name = 'VisionUnavailableError';
  }
}

export function loadVision(wasmBaseUrl: string): Promise<{ vision: Vision; fileset: Fileset }> {
  if (cache?.base === wasmBaseUrl) return cache.promise;
  if (!visionSupported()) throw new VisionUnavailableError();
  const promise = (async () => {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(wasmBaseUrl);
    return { vision, fileset };
  })();
  cache = { base: wasmBaseUrl, promise };
  promise.catch(() => (cache = undefined));
  return promise;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function sizeOf(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement): { W: number; H: number } {
  return 'naturalWidth' in source ? { W: source.naturalWidth, H: source.naturalHeight } : { W: source.width, H: source.height };
}

/** Whole picture plus overlapping tiles, so small things in large photos are found too. */
export function tiles(W: number, H: number): Box[] {
  const out: Box[] = [{ x: 0, y: 0, width: W, height: H }];
  const longest = Math.max(W, H);
  const grids = longest > 2400 ? [2, 3] : longest > 1000 ? [2] : [];
  for (const n of grids) {
    const tw = W / n;
    const th = H / n;
    for (let gy = 0; gy < n; gy++)
      for (let gx = 0; gx < n; gx++) {
        const x = Math.max(0, gx * tw - tw * 0.25);
        const y = Math.max(0, gy * th - th * 0.25);
        out.push({ x, y, width: Math.min(W - x, tw * 1.5), height: Math.min(H - y, th * 1.5) });
      }
  }
  return out;
}

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/** Overlap relative to the smaller box, to merge a thing found whole and again in a tile. */
export function containment(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / Math.min(a.width * a.height, b.width * b.height);
}
