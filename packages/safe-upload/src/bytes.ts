/** Small byte helpers shared by every format parser. No platform APIs beyond TextDecoder. */

export function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}
export function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
export function u16le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}
export function u32le(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}
export function u64be(b: Uint8Array, o: number): number {
  return u32be(b, o) * 0x1_0000_0000 + u32be(b, o + 4);
}

export function putU16be(b: Uint8Array, o: number, v: number): void {
  b[o] = (v >>> 8) & 0xff;
  b[o + 1] = v & 0xff;
}
export function putU32be(b: Uint8Array, o: number, v: number): void {
  b[o] = (v >>> 24) & 0xff;
  b[o + 1] = (v >>> 16) & 0xff;
  b[o + 2] = (v >>> 8) & 0xff;
  b[o + 3] = v & 0xff;
}
export function putU32le(b: Uint8Array, o: number, v: number): void {
  b[o] = v & 0xff;
  b[o + 1] = (v >>> 8) & 0xff;
  b[o + 2] = (v >>> 16) & 0xff;
  b[o + 3] = (v >>> 24) & 0xff;
}

/** Latin-1 decode; safe for 4CCs, marker identifiers and ASCII tag values. */
export function latin1(b: Uint8Array, start = 0, end = b.length): string {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(b[i]);
  return s;
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
export function utf8(b: Uint8Array): string {
  return utf8Decoder.decode(b);
}

export function encodeAscii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

export function startsWith(b: Uint8Array, offset: number, ascii: string): boolean {
  if (offset < 0 || offset + ascii.length > b.length) return false;
  for (let i = 0; i < ascii.length; i++) if (b[offset + i] !== ascii.charCodeAt(i)) return false;
  return true;
}

export function indexOfAscii(b: Uint8Array, ascii: string, from = 0, to = b.length): number {
  const first = ascii.charCodeAt(0);
  const last = Math.min(to, b.length) - ascii.length;
  for (let i = from; i <= last; i++) {
    if (b[i] === first && startsWith(b, i, ascii)) return i;
  }
  return -1;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Trim trailing NULs and whitespace from a decoded string. */
export function clean(s: string): string {
  return s.replace(/[\u0000\s]+$/u, '').replace(/^\s+/u, '');
}

let crcTable: Uint32Array | undefined;
export function crc32(b: Uint8Array, start = 0, end = b.length): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** zlib inflate via the Compression Streams API (browsers, workers, Node >= 18, Deno, Bun). */
export async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) throw new Error('DecompressionStream is not available in this runtime');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DS('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function toHex(n: number, width = 4): string {
  return '0x' + n.toString(16).toUpperCase().padStart(width, '0');
}
