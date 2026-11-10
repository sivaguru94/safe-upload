import { carryExif, toBytes } from '../api.js';
import type { Input, StripOptions } from '../types.js';
import { ctx2d, decode, encode, makeCanvas, type AnyCanvas, type Ctx } from './canvas.js';
import type { Box } from './faces.js';

export type RedactStyle = 'pixelate' | 'blur' | 'solid';

export interface RedactOptions extends StripOptions {
  style?: RedactStyle;
  /** Output type. Defaults to JPEG, or PNG when the input is PNG. */
  type?: 'image/jpeg' | 'image/png' | 'image/webp';
  quality?: number;
}

export interface RedactResult {
  blob: Blob;
  width: number;
  height: number;
}

function shape(ctx: Ctx, b: Box): void {
  ctx.beginPath();
  const r = Math.min(b.width, b.height) * 0.3;
  if ('roundRect' in ctx) ctx.roundRect(b.x, b.y, b.width, b.height, r);
  else (ctx as CanvasRenderingContext2D).rect(b.x, b.y, b.width, b.height);
}

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
    // Downscale destroys detail irreversibly; upscale either blocky (pixelate) or smooth (blur).
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

/**
 * Hide regions (faces, plates, screens) and re-encode the photo on-device.
 * Kept EXIF categories are copied into the new file; everything else is gone.
 */
export async function redact(input: Input, regions: Box[], options: RedactOptions = {}): Promise<RedactResult> {
  const bytes = await toBytes(input);
  const blobIn = input instanceof Blob ? input : new Blob([bytes as BlobPart]);
  const bitmap = await decode(blobIn);
  const { width, height } = bitmap;
  const canvas = makeCanvas(width, height);
  const ctx = ctx2d(canvas);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  for (const r of regions) applyRegion(ctx, canvas, r, options.style ?? 'pixelate');
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  const type = options.type ?? (isPng ? 'image/png' : 'image/jpeg');
  const encoded = new Uint8Array(await (await encode(canvas, type, options.quality ?? 0.92)).arrayBuffer());
  const merged = type === 'image/webp' ? encoded : await carryExif(bytes, encoded, { remove: options.remove, width, height });
  return { blob: new Blob([merged as BlobPart], { type }), width, height };
}
