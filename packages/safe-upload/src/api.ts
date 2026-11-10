import { concat, putU16be } from './bytes.js';
import { CATEGORY_INFO, resolveRemove, sortCategories } from './categories.js';
import { Collector } from './collect.js';
import { buildTiff, EXIF_HEADER, parseTiff } from './exif.js';
import { heifFormat, inspectHeif, stripHeif } from './heif.js';
import { inspectJpeg, isJpeg, parseJpeg, stripJpeg, type FormatStrip } from './jpeg.js';
import { insertPngExif, inspectPng, isPng, stripPng } from './png.js';
import type { Category, Format, Input, Report, StripOptions, StripResult } from './types.js';
import { inspectWebp, isWebp, stripWebp } from './webp.js';

const MIME: Record<Format, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  avif: 'image/avif',
  unknown: 'application/octet-stream',
};

export async function toBytes(input: Input): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof Blob !== 'undefined' && input instanceof Blob) return new Uint8Array(await input.arrayBuffer());
  throw new TypeError('Expected a Blob, File, ArrayBuffer or Uint8Array');
}

export function detectFormat(b: Uint8Array): Format {
  if (isJpeg(b)) return 'jpeg';
  if (isPng(b)) return 'png';
  if (isWebp(b)) return 'webp';
  return heifFormat(b) ?? 'unknown';
}

export class UnsupportedFormatError extends Error {
  constructor() {
    super('Unsupported file type. safe-upload reads JPEG, PNG, WebP, HEIC and AVIF.');
    this.name = 'UnsupportedFormatError';
  }
}

/** Read every metadata block in a photo and describe what it reveals. Never modifies the input. */
export async function inspect(input: Input): Promise<Report> {
  const b = await toBytes(input);
  const format = detectFormat(b);
  const c = new Collector(format, MIME[format], b.length);
  switch (format) {
    case 'jpeg':
      inspectJpeg(b, c);
      break;
    case 'png':
      await inspectPng(b, c);
      break;
    case 'webp':
      inspectWebp(b, c);
      break;
    case 'heic':
    case 'avif':
      inspectHeif(b, c);
      break;
    default:
      throw new UnsupportedFormatError();
  }
  return c.finish();
}

/**
 * Remove metadata by category without re-encoding: the compressed picture stays byte-identical.
 * Default removes everything except camera settings and content credentials.
 */
export async function strip(input: Input, options: StripOptions = {}): Promise<StripResult> {
  const b = await toBytes(input);
  const format = detectFormat(b);
  const remove = resolveRemove(options.remove);
  let r: FormatStrip;
  switch (format) {
    case 'jpeg':
      r = stripJpeg(b, remove);
      break;
    case 'png':
      r = await stripPng(b, remove);
      break;
    case 'webp':
      r = stripWebp(b, remove);
      break;
    case 'heic':
    case 'avif':
      r = stripHeif(b, remove);
      break;
    default:
      throw new UnsupportedFormatError();
  }
  return {
    bytes: r.bytes,
    mime: MIME[format],
    format,
    lossless: true,
    removed: sortCategories(r.removed),
    retained: r.retained,
    notes: [...new Set(r.notes)],
  };
}

/** Convenience: strip and return a Blob ready for FormData/fetch. */
export async function stripToBlob(input: Input, options: StripOptions = {}): Promise<Blob> {
  const r = await strip(input, options);
  return new Blob([r.bytes as BlobPart], { type: r.mime });
}

/**
 * Copy the kept EXIF categories from an original photo into a freshly encoded JPEG or PNG
 * (for example after blurring faces on a canvas). Orientation is reset to 1 because canvas
 * output is already upright; thumbnails are dropped because they no longer match.
 */
export async function carryExif(original: Input, encoded: Input, options: StripOptions & { width: number; height: number }): Promise<Uint8Array> {
  const src = await toBytes(original);
  const dst = await toBytes(encoded);
  const tiffBytes = await extractTiff(src);
  if (!tiffBytes) return dst;
  const tiff = parseTiff(tiffBytes);
  if (!tiff) return dst;
  const remove = resolveRemove(options.remove);
  remove.add('thumbnail');
  const built = buildTiff(tiff, { remove, orientation: 1, dimensions: { width: options.width, height: options.height } });
  if (!built.bytes) return dst;
  if (isJpeg(dst)) {
    const j = parseJpeg(dst);
    // Insert after JFIF APP0 if present, otherwise right after SOI.
    const jfif = j.head.find((s) => s.kind === 'jfif');
    const at = jfif ? jfif.end : 2;
    const payload = concat([EXIF_HEADER, built.bytes]);
    const seg = new Uint8Array(4 + payload.length);
    seg[0] = 0xff;
    seg[1] = 0xe1;
    putU16be(seg, 2, payload.length + 2);
    seg.set(payload, 4);
    return concat([dst.subarray(0, at), seg, dst.subarray(at)]);
  }
  if (isPng(dst)) return insertPngExif(dst, built.bytes);
  return dst;
}

/** Locate the raw TIFF/EXIF block inside a JPEG, PNG, WebP or HEIF file. */
async function extractTiff(b: Uint8Array): Promise<Uint8Array | null> {
  const fmt = detectFormat(b);
  if (fmt === 'jpeg') {
    const seg = parseJpeg(b).head.find((s) => s.kind === 'exif');
    return seg ? seg.payload.subarray(6) : null;
  }
  // For other formats reuse inspect-time parsing via a tiny collector.
  const holder: { tiff?: Uint8Array } = {};
  const c = new Collector(fmt, '', b.length);
  const orig = c.tiff.bind(c);
  c.tiff = (bytes, source, removable) => {
    holder.tiff ??= bytes;
    return orig(bytes, source, removable);
  };
  try {
    if (fmt === 'webp') inspectWebp(b, c);
    else if (fmt === 'heic' || fmt === 'avif') inspectHeif(b, c);
    else if (fmt === 'png') await inspectPng(b, c);
  } catch {
    return null;
  }
  return holder.tiff ?? null;
}

export function describeCategory(c: Category) {
  return CATEGORY_INFO[c];
}
