export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** iOS Safari refuses canvases larger than this many pixels (4096 × 4096). */
export const IOS_CANVAS_LIMIT = 16_777_216;

export function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

export function ctx2d(c: AnyCanvas): Ctx {
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('2D canvas is not available');
  return ctx;
}

export async function encode(c: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    (c as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas encoding failed'))), type, quality),
  );
}

export interface Decoded {
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  close(): void;
}

/**
 * Decode a photo with its EXIF orientation applied, so pixels are upright. Falls back to an
 * <img> element when createImageBitmap refuses very large pictures (seen on mobile Safari).
 */
export async function decodeImage(input: Blob): Promise<Decoded> {
  try {
    const b = await createImageBitmap(input, { imageOrientation: 'from-image' });
    return { source: b, width: b.width, height: b.height, close: () => b.close() };
  } catch {
    if (typeof document === 'undefined') throw unsupported();
    const url = URL.createObjectURL(input);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      throw unsupported();
    }
  }
}

function unsupported(): Error {
  return new Error('This browser cannot decode this image format (HEIC needs Safari). Metadata removal still works.');
}

/** @deprecated use decodeImage */
export async function decode(input: Blob): Promise<ImageBitmap> {
  return createImageBitmap(input, { imageOrientation: 'from-image' });
}
