import { ctx2d, makeCanvas } from './canvas.js';
import { containment, iou, sizeOf, type Box } from './mediapipe.js';
import { clampBox } from './faces.js';

export interface TextBox extends Box {
  score: number;
}

export interface TextDetectionOptions {
  /** URL of the folder holding onnxruntime-web's ort-wasm-simd-threaded.{mjs,wasm} (self-host it). */
  wasmBaseUrl: string;
  /** URL of a PaddleOCR DB text-detection model in ONNX form, e.g. PP-OCRv4 mobile det (self-host it). */
  modelAssetUrl: string;
  /** Longest side the picture is scaled to before detection. Default 1280. */
  maxSide?: number;
  /** Minimum mean probability inside a region, 0..1. Default 0.6. */
  minScore?: number;
}

type Tensor = { data: Float32Array; dims: readonly number[] };
type Session = { inputNames: readonly string[]; outputNames: readonly string[]; run(feeds: Record<string, unknown>): Promise<Record<string, Tensor>> };
type Ort = {
  env: { wasm: { wasmPaths?: string; numThreads?: number } };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(url: string, o: object): Promise<Session> };
};

let cached: { key: string; ready: Promise<{ ort: Ort; session: Session }> } | undefined;

async function getSession(o: TextDetectionOptions) {
  const key = `${o.wasmBaseUrl}|${o.modelAssetUrl}`;
  if (cached?.key === key) return cached.ready;
  const ready = (async () => {
    const ort = (await import('onnxruntime-web/wasm')) as unknown as Ort;
    ort.env.wasm.wasmPaths = o.wasmBaseUrl.endsWith('/') ? o.wasmBaseUrl : o.wasmBaseUrl + '/';
    // Threads need cross-origin isolation (SharedArrayBuffer); one thread works everywhere.
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(o.modelAssetUrl, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { ort, session };
  })();
  cached = { key, ready };
  ready.catch(() => (cached = undefined));
  return ready;
}

/** Load the text detector ahead of time (downloads the WASM runtime and model). */
export async function preloadTextDetector(o: TextDetectionOptions): Promise<void> {
  await getSession(o);
}

/**
 * Turn a DB probability map into axis-aligned text boxes (map coordinates).
 * Pixels above `threshold` are grouped into 4-connected regions; a region is kept when its mean
 * probability reaches `minScore`, then grown by the DB "unclip" distance (area * ratio / perimeter)
 * because the model predicts shrunken text kernels.
 */
export function textBoxesFromMap(prob: Float32Array, w: number, h: number, o: { threshold?: number; minScore?: number; unclip?: number; minSide?: number } = {}): TextBox[] {
  const threshold = o.threshold ?? 0.3;
  const minScore = o.minScore ?? 0.6;
  const ratio = o.unclip ?? 1.6;
  const minSide = o.minSide ?? 3;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: TextBox[] = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || prob[start] <= threshold) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, sum = 0, n = 0;
    while (top) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      sum += prob[i];
      n++;
      if (x > 0 && !seen[i - 1] && prob[i - 1] > threshold) (seen[i - 1] = 1), (stack[top++] = i - 1);
      if (x < w - 1 && !seen[i + 1] && prob[i + 1] > threshold) (seen[i + 1] = 1), (stack[top++] = i + 1);
      if (y > 0 && !seen[i - w] && prob[i - w] > threshold) (seen[i - w] = 1), (stack[top++] = i - w);
      if (y < h - 1 && !seen[i + w] && prob[i + w] > threshold) (seen[i + w] = 1), (stack[top++] = i + w);
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const score = sum / n;
    if (Math.min(bw, bh) < minSide || score < minScore) continue;
    const d = (bw * bh * ratio) / (2 * (bw + bh));
    const x = Math.max(0, x0 - d);
    const y = Math.max(0, y0 - d);
    out.push({ x, y, width: Math.min(w, x1 + 1 + d) - x, height: Math.min(h, y1 + 1 + d) - y, score });
  }
  return out;
}

// PaddleOCR normalisation, applied to channels in BGR order as the reference pipeline (OpenCV) does.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/**
 * Find readable text on-device: number plates, house numbers, signs, name tags, screens.
 * Boxes cover whole words or lines; nothing is read or recognised. Coordinates are in the source's pixel space.
 */
export async function detectText(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement, options: TextDetectionOptions): Promise<TextBox[]> {
  const { ort, session } = await getSession(options);
  const { W, H } = sizeOf(source);
  const maxSide = options.maxSide ?? 1280;
  const scale = Math.min(1, maxSide / Math.max(W, H));
  // The network downsamples by 32.
  const w = Math.max(32, Math.round((W * scale) / 32) * 32);
  const h = Math.max(32, Math.round((H * scale) / 32) * 32);
  const ctx = ctx2d(makeCanvas(w, h));
  ctx.drawImage(source as CanvasImageSource, 0, 0, W, H, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const plane = w * h;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) input[c * plane + i] = (px[i * 4 + (2 - c)] / 255 - MEAN[c]) / STD[c];
  }
  const result = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, h, w]) });
  const map = result[session.outputNames[0]];
  const mh = map.dims[2];
  const mw = map.dims[3];
  const sx = W / mw;
  const sy = H / mh;
  const boxes = textBoxesFromMap(map.data, mw, mh, { minScore: options.minScore })
    .map((b) => clampBox({ x: b.x * sx, y: b.y * sy, width: b.width * sx, height: b.height * sy, score: b.score }, W, H))
    .sort((a, b) => b.score - a.score);
  const kept: TextBox[] = [];
  for (const b of boxes) if (!kept.some((k) => iou(k, b) > 0.5 || containment(k, b) > 0.8)) kept.push(b);
  return kept;
}

/**
 * Text that sits on a car, motorbike, bus or truck and is shaped like a plate (wider than tall)
 * is very likely a number plate. Returns the indexes of those text boxes.
 */
export function plateCandidates(text: Box[], vehicles: Box[]): Set<number> {
  const out = new Set<number>();
  text.forEach((t, i) => {
    const aspect = t.width / t.height;
    if (aspect < 1.2 || aspect > 9) return;
    if (vehicles.some((v) => containment(v, t) > 0.7)) out.add(i);
  });
  return out;
}
