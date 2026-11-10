import { carryExif, toBytes } from '../api.js';
import type { Input, StripOptions } from '../types.js';
import { ctx2d, decodeImage, encode, IOS_CANVAS_LIMIT, makeCanvas, type AnyCanvas, type Ctx, type Decoded } from './canvas.js';
import type { Box } from './mediapipe.js';

export type RedactStyle = 'pixelate' | 'blur' | 'solid';

export interface RedactOptions extends StripOptions {
  style?: RedactStyle;
  /** Output type. Defaults to JPEG, or PNG when the input is PNG. */
  type?: 'image/jpeg' | 'image/png' | 'image/webp';
  quality?: number;
  /**
   * Largest canvas area used at once. Bigger JPEG photos are processed in strips and encoded with
   * @jsquash/jpeg (WASM), keeping full resolution. Default: 16,777,216, the iOS Safari limit.
   */
  maxCanvasPixels?: number;
}

export interface RedactResult {
  blob: Blob;
  width: number;
  height: number;
  /** The picture was processed in strips because it exceeds maxCanvasPixels. */
  tiled: boolean;
  /** The output is smaller than the original because the browser could not handle full size. */
  downscaled: boolean;
}

function shape(ctx: Ctx, b: Box): void {
  ctx.beginPath();
  const r = Math.min(b.width, b.height) * 0.3;
  if ('roundRect' in ctx) ctx.roundRect(b.x, b.y, b.width, b.height, r);
  else (ctx as CanvasRenderingContext2D).rect(b.x, b.y, b.width, b.height);
}

/** Hide one area of a canvas in place. */
function applyRegion(ctx: Ctx, canvas: AnyCanvas, b: Box, style: RedactStyle): void {
  const x = Math.floor(b.x);
  const y = Math.floor(b.y);
  const w = Math.max(1, Math.ceil(b.width));
  const h = Math.max(1, Math.ceil(b.height));
  ctx.save();
  shape(ctx, { x, y, width: w, height: h });
  ctx.clip();
  if (style === 'solid') {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
  } else {
    // Downscaling destroys detail irreversibly; upscale either blocky (pixelate) or smooth (blur).
    const factor = style === 'pixelate' ? Math.max(8, Math.round(Math.max(w, h) / 7)) : Math.max(12, Math.round(Math.max(w, h) / 5));
    const sw = Math.max(1, Math.round(w / factor));
    const sh = Math.max(1, Math.round(h / factor));
    const small = makeCanvas(sw, sh);
    const sctx = ctx2d(small);
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(canvas as CanvasImageSource, x, y, w, h, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = style === 'blur';
    if (style === 'blur') ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small as CanvasImageSource, 0, 0, sw, sh, x, y, w, h);
  }
  ctx.restore();
}

/** Whole-picture path: one canvas. Used when the picture fits the canvas limit. */
async function singleCanvas(img: Decoded, regions: Box[], style: RedactStyle, type: string, quality: number, scale = 1) {
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = makeCanvas(width, height);
  const ctx = ctx2d(canvas);
  ctx.drawImage(img.source, 0, 0, width, height);
  for (const r of regions) applyRegion(ctx, canvas, { x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale }, style);
  const blob = await encode(canvas, type, quality);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/**
 * Strip path: render each hidden area once as a patch, then build the picture strip by strip
 * (each strip within the canvas limit), copy the pixels into one buffer and encode with mozjpeg.
 */
async function strips(img: Decoded, regions: Box[], style: RedactStyle, quality: number, max: number) {
  const { width: W, height: H } = img;
  const { default: encodeJpeg } = await import('@jsquash/jpeg/encode');

  const patches = regions.map((r) => {
    const rx = Math.max(0, Math.floor(r.x));
    const ry = Math.max(0, Math.floor(r.y));
    const rw = Math.min(W - rx, Math.ceil(r.width));
    const rh = Math.min(H - ry, Math.ceil(r.height));
    const s = Math.min(1, Math.sqrt(max / Math.max(1, rw * rh)));
    const pw = Math.max(1, Math.round(rw * s));
    const ph = Math.max(1, Math.round(rh * s));
    const canvas = makeCanvas(pw, ph);
    const ctx = ctx2d(canvas);
    ctx.drawImage(img.source, rx, ry, rw, rh, 0, 0, pw, ph);
    applyRegion(ctx, canvas, { x: 0, y: 0, width: pw, height: ph }, style);
    return { canvas, rx, ry, rw, rh, pw, ph };
  });

  const stripH = Math.max(1, Math.min(H, Math.floor(max / W)));
  const data = new Uint8ClampedArray(W * H * 4);
  let canvas = makeCanvas(W, stripH);
  let ctx = ctx2d(canvas);
  for (let y = 0; y < H; y += stripH) {
    const h = Math.min(stripH, H - y);
    if (h !== canvas.height) {
      canvas = makeCanvas(W, h);
      ctx = ctx2d(canvas);
    }
    ctx.clearRect(0, 0, W, h);
    ctx.drawImage(img.source, 0, y, W, h, 0, 0, W, h);
    for (const p of patches) {
      if (p.ry >= y + h || p.ry + p.rh <= y) continue;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(p.canvas as CanvasImageSource, 0, 0, p.pw, p.ph, p.rx, p.ry - y, p.rw, p.rh);
    }
    data.set(ctx.getImageData(0, 0, W, h).data, y * W * 4);
  }
  const out = await encodeJpeg({ data, width: W, height: H, colorSpace: 'srgb' } as ImageData, { quality: Math.round(quality * 100) });
  return { bytes: new Uint8Array(out), width: W, height: H };
}

/**
 * Hide regions (faces, plates, screens) and re-encode the photo on-device. Kept EXIF categories
 * are copied into the new file; everything else is gone. Region coordinates are in the upright
 * picture's pixel space (as shown by an <img> element).
 */
export async function redact(input: Input, regions: Box[], options: RedactOptions = {}): Promise<RedactResult> {
  const bytes = await toBytes(input);
  const blobIn = input instanceof Blob ? input : new Blob([bytes as BlobPart]);
  const img = await decodeImage(blobIn);
  const style = options.style ?? 'pixelate';
  const quality = options.quality ?? 0.92;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const type = options.type ?? (isPng ? 'image/png' : 'image/jpeg');
  const max = options.maxCanvasPixels ?? IOS_CANVAS_LIMIT;
  let result: { bytes: Uint8Array; width: number; height: number };
  let tiled = false;
  let downscaled = false;
  try {
    if (img.width * img.height <= max) {
      try {
        result = await singleCanvas(img, regions, style, type, quality);
      } catch (err) {
        if (type !== 'image/jpeg') throw err;
        // The browser refused a canvas this size even though it is under the limit: use strips.
        result = await strips(img, regions, style, quality, Math.min(max, IOS_CANVAS_LIMIT / 4));
        tiled = true;
      }
    } else if (type === 'image/jpeg') {
      try {
        result = await strips(img, regions, style, quality, max);
        tiled = true;
      } catch {
        // Encoder missing or out of memory: fall back to the largest picture the canvas allows.
        result = await singleCanvas(img, regions, style, type, quality, Math.sqrt(max / (img.width * img.height)) * 0.999);
        downscaled = true;
      }
    } else {
      result = await singleCanvas(img, regions, style, type, quality, Math.sqrt(max / (img.width * img.height)) * 0.999);
      downscaled = true;
    }
  } finally {
    img.close();
  }
  const merged = type === 'image/webp' ? result.bytes : await carryExif(bytes, result.bytes, { remove: options.remove, width: result.width, height: result.height });
  return { blob: new Blob([merged as BlobPart], { type }), width: result.width, height: result.height, tiled, downscaled };
}
