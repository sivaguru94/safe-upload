import { ctx2d, makeCanvas } from './canvas.js';
import { clampBox } from './faces.js';
import { containment, iou, loadVision, sizeOf, tiles, type Box } from './mediapipe.js';

export interface DetectedObject extends Box {
  /** COCO class name, e.g. "laptop", "car", "person". */
  label: string;
  score: number;
}

export interface ObjectDetectionOptions {
  /** Folder holding MediaPipe's vision_wasm_internal.{js,wasm} (self-host it). */
  wasmBaseUrl: string;
  /** EfficientDet-Lite .tflite model (self-host it). */
  modelAssetUrl: string;
  /** Minimum confidence, 0..1. Default 0.35. */
  minScore?: number;
}

type Detector = { detect(image: unknown): { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number }; categories: { score: number; categoryName: string }[] }[] } };

let cached: { key: string; detector: Promise<Detector> } | undefined;

async function getDetector(o: ObjectDetectionOptions): Promise<Detector> {
  const key = `${o.wasmBaseUrl}|${o.modelAssetUrl}|${o.minScore ?? 0.35}`;
  if (cached?.key === key) return cached.detector;
  const detector = (async () => {
    const { vision, fileset } = await loadVision(o.wasmBaseUrl);
    return (await vision.ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: o.modelAssetUrl, delegate: 'CPU' },
      runningMode: 'IMAGE',
      scoreThreshold: o.minScore ?? 0.35,
      maxResults: 40,
    })) as unknown as Detector;
  })();
  cached = { key, detector };
  detector.catch(() => (cached = undefined));
  return detector;
}

/** Find everyday objects on-device (80 COCO classes). Coordinates are in the source's pixel space. */
export async function detectObjects(source: ImageBitmap | HTMLImageElement | HTMLCanvasElement, options: ObjectDetectionOptions): Promise<DetectedObject[]> {
  const det = await getDetector(options);
  const { W, H } = sizeOf(source);
  const found: DetectedObject[] = [];
  for (const t of tiles(W, H)) {
    const scale = Math.min(1, 1024 / Math.max(t.width, t.height));
    const cw = Math.max(1, Math.round(t.width * scale));
    const ch = Math.max(1, Math.round(t.height * scale));
    const ctx = ctx2d(makeCanvas(cw, ch));
    ctx.drawImage(source as CanvasImageSource, t.x, t.y, t.width, t.height, 0, 0, cw, ch);
    for (const d of det.detect(ctx.getImageData(0, 0, cw, ch)).detections) {
      const bb = d.boundingBox;
      const c = d.categories[0];
      if (bb && c) found.push({ label: c.categoryName, score: c.score, x: t.x + bb.originX / scale, y: t.y + bb.originY / scale, width: bb.width / scale, height: bb.height / scale });
    }
  }
  found.sort((a, b) => b.score - a.score);
  const kept: DetectedObject[] = [];
  for (const f of found) if (!kept.some((k) => k.label === f.label && (iou(k, f) > 0.45 || containment(k, f) > 0.75))) kept.push(f);
  return kept.map((f) => clampBox(f, W, H));
}

export type HintKind = 'screen' | 'document' | 'vehicle' | 'people' | 'home' | 'street' | 'travel' | 'time' | 'pet';

export interface ObjectHint {
  kind: HintKind;
  /** e.g. "2 screens" */
  title: string;
  /** What it can give away, in plain words. */
  hint: string;
  /** True when hiding the area is a sensible suggestion. */
  redactable: boolean;
  objects: DetectedObject[];
}

/** Per-group confidence bars: lower where a miss is costly (screens, people), higher where false alarms are likely. */
const GROUPS: { kind: HintKind; labels: string[]; one: string; many: string; hint: string; redactable: boolean; min: number }[] = [
  { kind: 'screen', labels: ['laptop', 'tv', 'cell phone'], one: 'screen', many: 'screens', hint: 'Screens can show messages, emails, maps, names or an address. Zoom in and hide anything readable.', redactable: true, min: 0.45 },
  { kind: 'document', labels: ['book'], one: 'book or printed page', many: 'books or printed pages', hint: 'Letters, labels and printed pages can carry names, addresses and account numbers.', redactable: true, min: 0.55 },
  { kind: 'vehicle', labels: ['car', 'truck', 'bus', 'motorcycle'], one: 'vehicle', many: 'vehicles', hint: 'Number plates identify a vehicle and its owner, and their format gives away the country or state.', redactable: true, min: 0.45 },
  { kind: 'people', labels: ['person'], one: 'person', many: 'people', hint: 'Faces are covered by the face scan, but tattoos, uniforms, name badges and school logos can still identify people.', redactable: false, min: 0.4 },
  { kind: 'home', labels: ['bed', 'couch', 'dining table', 'toilet', 'refrigerator', 'oven', 'microwave', 'sink', 'potted plant'], one: 'household item', many: 'household items', hint: 'This looks like the inside of a home. Rooms and the view from a window are often enough to find an address.', redactable: false, min: 0.55 },
  { kind: 'street', labels: ['stop sign', 'traffic light', 'fire hydrant', 'parking meter', 'bench'], one: 'street sign or fixture', many: 'street signs and fixtures', hint: 'Street signs and fixtures differ by country and city; together with buildings they can pin down the street.', redactable: false, min: 0.5 },
  { kind: 'travel', labels: ['airplane', 'train', 'boat', 'suitcase'], one: 'travel item', many: 'travel items', hint: 'Travel scenes show that you are away from home.', redactable: false, min: 0.55 },
  { kind: 'time', labels: ['clock'], one: 'clock', many: 'clocks', hint: 'A visible clock shows the time the photo was taken.', redactable: false, min: 0.55 },
  { kind: 'pet', labels: ['dog', 'cat', 'bird', 'horse'], one: 'pet or animal', many: 'pets or animals', hint: "Pets' names are common password and security-question answers; avoid naming them in the caption.", redactable: false, min: 0.6 },
];

/** Turn detected objects into privacy hints, most important first. */
export function objectHints(objects: DetectedObject[]): ObjectHint[] {
  const out: ObjectHint[] = [];
  for (const g of GROUPS) {
    const objs = objects.filter((o) => g.labels.includes(o.label) && o.score >= g.min);
    if (!objs.length) continue;
    out.push({ kind: g.kind, title: `${objs.length} ${objs.length === 1 ? g.one : g.many}`, hint: g.hint, redactable: g.redactable, objects: objs });
  }
  return out;
}
