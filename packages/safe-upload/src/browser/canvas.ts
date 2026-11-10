export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

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

/** Decode a photo with its EXIF orientation applied, so pixels are upright. */
export async function decode(input: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(input, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser cannot decode this image format (HEIC needs Safari). Metadata removal still works.');
  }
}
