import { concat, latin1, putU16be, startsWith, u16be, u32be } from './bytes.js';
import { Collector } from './collect.js';
import { buildTiff, EXIF_HEADER, parseTiff, tiffCategories } from './exif.js';
import { analyzeIrb } from './iptc.js';
import type { Category, Finding, HiddenMedia } from './types.js';
import { analyzeXmp } from './xmp.js';

type Kind = 'exif' | 'xmp' | 'xmpext' | 'iptc' | 'icc' | 'mpf' | 'jfif' | 'jfxx' | 'adobe' | 'jumbf' | 'com' | 'app' | 'image';

export interface JpegSegment {
  marker: number;
  /** Offset of the 0xFF marker byte. */
  start: number;
  /** Offset after the segment. */
  end: number;
  /** Payload after the 2-byte length. */
  payload: Uint8Array;
  kind: Kind;
}

export interface ParsedJpeg {
  /** Segments between SOI and the first SOS, in file order. */
  head: JpegSegment[];
  /** Offset of the first SOS marker. */
  scanStart: number;
  /** Offset just after the main image's EOI. */
  imageEnd: number;
  trailer: Uint8Array;
  width?: number;
  height?: number;
}

const XMP_ID = 'http://ns.adobe.com/xap/1.0/\0';
const XMP_EXT_ID = 'http://ns.adobe.com/xmp/extension/\0';

function kindOf(marker: number, p: Uint8Array): Kind {
  if (marker === 0xfe) return 'com';
  if (marker === 0xe0) return startsWith(p, 0, 'JFIF\0') ? 'jfif' : startsWith(p, 0, 'JFXX\0') ? 'jfxx' : 'app';
  if (marker === 0xe1) {
    if (startsWith(p, 0, 'Exif\0')) return 'exif';
    if (startsWith(p, 0, XMP_ID)) return 'xmp';
    if (startsWith(p, 0, XMP_EXT_ID)) return 'xmpext';
    return 'app';
  }
  if (marker === 0xe2) {
    if (startsWith(p, 0, 'ICC_PROFILE\0')) return 'icc';
    if (startsWith(p, 0, 'MPF\0')) return 'mpf';
    return 'app';
  }
  if (marker === 0xeb) return 'jumbf';
  if (marker === 0xed) return 'iptc';
  if (marker === 0xee && startsWith(p, 0, 'Adobe')) return 'adobe';
  if (marker >= 0xe0 && marker <= 0xef) return 'app';
  return 'image';
}

export function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

/** Find the end (offset after EOI) of a JPEG starting at `from`, scanning through entropy-coded data. */
export function findJpegEnd(b: Uint8Array, from: number): number {
  let p = from + 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) {
      p++;
      continue;
    }
    const m = b[p + 1];
    if (m === 0xff) {
      p++;
      continue;
    }
    if (m === 0xd9) return p + 2;
    if (m === 0x00 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
      p += 2;
      continue;
    }
    // A marker segment with length; skip it (inside scans this only happens between scans).
    const len = u16be(b, p + 2);
    if (m === 0xda) {
      // Start of scan: skip header, then scan entropy data for the next real marker.
      p += 2 + len;
      while (p + 1 < b.length) {
        if (b[p] === 0xff) {
          const n = b[p + 1];
          if (n !== 0x00 && !(n >= 0xd0 && n <= 0xd7) && n !== 0xff) break;
        }
        p++;
      }
      continue;
    }
    p += 2 + len;
  }
  return b.length;
}

export function parseJpeg(b: Uint8Array): ParsedJpeg {
  const head: JpegSegment[] = [];
  let p = 2;
  let width: number | undefined;
  let height: number | undefined;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) throw new Error(`Corrupt JPEG: expected a marker at byte ${p}`);
    const marker = b[p + 1];
    if (marker === 0xff) {
      p++;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      p += 2;
      continue;
    }
    const len = u16be(b, p + 2);
    if (len < 2 || p + 2 + len > b.length) throw new Error('Corrupt JPEG: segment runs past the end of the file');
    const payload = b.subarray(p + 4, p + 2 + len);
    const kind = kindOf(marker, payload);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && payload.length >= 5) {
      height = u16be(payload, 1);
      width = u16be(payload, 3);
    }
    head.push({ marker, start: p, end: p + 2 + len, payload, kind });
    p += 2 + len;
  }
  const scanStart = p;
  const imageEnd = findJpegEnd(b, 0);
  return { head, scanStart, imageEnd, trailer: b.subarray(imageEnd), width, height };
}

/** Image types declared in a CIPA DC-007 multi-picture (MPF) index. */
const MP_TYPES: Record<number, string> = {
  0x010001: 'Large preview copy of the picture (VGA)',
  0x010002: 'Large preview copy of the picture (Full HD)',
  0x010003: 'Large preview copy of the picture (4K)',
  0x010004: 'Large preview copy of the picture (8K)',
  0x010005: 'Large preview copy of the picture (16K)',
  0x020001: 'Panorama frame',
  0x020002: 'Stereo (disparity) image',
  0x020003: 'Multi-angle image',
  0x040000: 'Original, unedited image',
  0x050000: 'HDR gain map',
};

/**
 * Read the MPF index in an APP2 segment and return a label for each extra image, keyed by its
 * absolute offset in the file. Offsets in the index count from the MPF TIFF header.
 */
export function mpfLabels(seg: JpegSegment): Map<number, string> {
  const out = new Map<number, string>();
  const tiff = parseTiff(seg.payload.subarray(4));
  const entry = tiff?.ifds.ifd0?.find((e) => e.tag === 0xb002);
  if (!tiff || !entry) return out;
  const v = entry.value;
  const r32 = (o: number) => (tiff.le ? (v[o] | (v[o + 1] << 8) | (v[o + 2] << 16) | (v[o + 3] << 24)) >>> 0 : u32be(v, o));
  const tiffAbs = seg.start + 4 + 4;
  for (let o = 0; o + 16 <= v.length; o += 16) {
    const type = r32(o) & 0xffffff;
    const offset = r32(o + 8);
    if (offset === 0) continue; // the main image
    out.set(tiffAbs + offset, MP_TYPES[type] ?? 'Extra image (for example an HDR gain map, depth map or preview)');
  }
  return out;
}

/** Split bytes after the main image into recognisable items (extra JPEGs, MP4/MOV video, vendor data). */
export function splitTrailer(trailer: Uint8Array, motionVideoLength?: number, labelAt?: (relativeOffset: number) => string | undefined): HiddenMedia[] {
  const items: HiddenMedia[] = [];
  const n = trailer.length;
  // Google motion photos declare the video length counted from the end of the file.
  const videoStart = motionVideoLength && motionVideoLength <= n ? n - motionVideoLength : -1;
  const isBox = (q: number) => q + 12 <= n && startsWith(trailer, q + 4, 'ftyp') && u32be(trailer, q) >= 8 && u32be(trailer, q) < 4096;
  let p = 0;
  while (p < n) {
    if (videoStart >= 0 && p >= videoStart) {
      items.push({ kind: 'video', mime: 'video/mp4', label: 'Motion photo video', bytes: trailer.subarray(videoStart) });
      return items;
    }
    if (isBox(p)) {
      const brand = latin1(trailer, p + 8, p + 12);
      const mime = brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
      items.push({ kind: 'video', mime, label: 'Embedded video (motion or live photo)', bytes: trailer.subarray(p) });
      return items;
    }
    if (isJpeg(trailer.subarray(p, p + 4))) {
      const end = findJpegEnd(trailer, p);
      const limit = videoStart >= 0 ? Math.min(end, videoStart) : end;
      items.push({ kind: 'image', mime: 'image/jpeg', label: labelAt?.(p) ?? 'Extra image (for example an HDR gain map, depth map or preview)', bytes: trailer.subarray(p, limit) });
      p = limit;
      continue;
    }
    if (trailer[p] === 0) {
      p++; // padding
      continue;
    }
    // Unknown data: run until a later video box or JPEG start.
    let q = p + 1;
    while (q < n && !isBox(q) && !(trailer[q] === 0xff && trailer[q + 1] === 0xd8 && trailer[q + 2] === 0xff) && !(videoStart >= 0 && q >= videoStart)) q++;
    const samsung = q >= 4 && startsWith(trailer, q - 4, 'SEFT');
    items.push({ kind: 'data', mime: 'application/octet-stream', label: samsung ? 'Samsung extra data' : 'Unrecognised data after the image', bytes: trailer.subarray(p, q) });
    p = q;
  }
  return items;
}

export function inspectJpeg(b: Uint8Array, c: Collector): void {
  const j = parseJpeg(b);
  c.report.width = j.width;
  c.report.height = j.height;
  let motionVideoLength: number | undefined;
  let comIndex = 0;
  let mpf = new Map<number, string>();
  for (const s of j.head) {
    switch (s.kind) {
      case 'exif':
        c.tiff(s.payload.subarray(6), 'exif');
        break;
      case 'xmp': {
        const a = analyzeXmp(new TextDecoder().decode(s.payload.subarray(XMP_ID.length)));
        if (a.motionVideoLength) motionVideoLength = a.motionVideoLength;
        c.xmp(s.payload.subarray(XMP_ID.length), 'xmp');
        break;
      }
      case 'xmpext':
        c.add({ category: 'other', source: 'xmp', key: 'xmp.extended', label: 'Extended XMP block', value: `${s.payload.length.toLocaleString('en')} bytes`, removable: true });
        break;
      case 'iptc':
        c.irb(s.payload, 'iptc');
        break;
      case 'mpf':
        mpf = mpfLabels(s);
        c.add({ category: 'hidden', source: 'jpeg', key: 'jpeg.MPF', label: 'Multi-picture index', value: `The file declares ${mpf.size || 'some'} extra picture${mpf.size === 1 ? '' : 's'} stored after the main image`, removable: true });
        break;
      case 'jumbf':
        c.add({ category: 'provenance', source: 'jpeg', key: 'jpeg.JUMBF', label: 'Content credentials (C2PA/JUMBF)', value: `${s.payload.length.toLocaleString('en')} bytes`, removable: true });
        break;
      case 'com': {
        const text = new TextDecoder().decode(s.payload).replace(/\0+$/, '');
        c.add({ category: 'descriptions', source: 'jpeg', key: `jpeg.Comment${comIndex++ || ''}`, label: 'JPEG comment', value: text.length > 300 ? text.slice(0, 300) + '…' : text, removable: true });
        break;
      }
      case 'jfxx':
        c.add({ category: 'thumbnail', source: 'jpeg', key: 'jpeg.JFXX', label: 'JFIF thumbnail', value: `${s.payload.length.toLocaleString('en')} bytes`, removable: true });
        break;
      case 'app': {
        const id = latin1(s.payload, 0, Math.min(16, s.payload.length)).split('\0')[0].replace(/[^\x20-\x7e]/g, '');
        c.add({ category: 'other', source: 'jpeg', key: `jpeg.APP${s.marker - 0xe0}`, label: `APP${s.marker - 0xe0} block${id ? ` "${id}"` : ''}`, value: `${s.payload.length.toLocaleString('en')} bytes`, removable: true });
        break;
      }
    }
  }
  if (j.trailer.length) {
    const items = splitTrailer(j.trailer, motionVideoLength, (rel) => mpf.get(j.imageEnd + rel));
    const meaningful = items.filter((i) => i.bytes.length > 0);
    for (const h of meaningful) {
      c.hidden(h);
      c.add({ category: 'hidden', source: 'jpeg', key: `jpeg.trailer.${h.kind}`, label: h.label, value: `${h.bytes.length.toLocaleString('en')} bytes after the end of the picture`, removable: true });
    }
  }
}

export interface FormatStrip {
  bytes: Uint8Array;
  removed: Set<Category>;
  retained: Finding[];
  notes: string[];
}

function segment(marker: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  out[0] = 0xff;
  out[1] = marker;
  putU16be(out, 2, payload.length + 2);
  out.set(payload, 4);
  return out;
}

/** Remove metadata categories from a JPEG without touching the compressed picture. */
export function stripJpeg(b: Uint8Array, remove: Set<Category>, exifOverride?: { orientation?: number; dimensions?: { width: number; height: number } }): FormatStrip {
  const j = parseJpeg(b);
  const removed = new Set<Category>();
  const notes: string[] = [];
  const parts: Uint8Array[] = [b.subarray(0, 2)];

  // Decide on XMP as a whole: remove it if any category it carries is being removed.
  const xmpSegs = j.head.filter((s) => s.kind === 'xmp');
  let dropXmp = false;
  let motionVideoLength: number | undefined;
  for (const s of xmpSegs) {
    const a = analyzeXmp(new TextDecoder().decode(s.payload.subarray(XMP_ID.length)));
    if (a.motionVideoLength) motionVideoLength = a.motionVideoLength;
    const hits = [...a.categories].filter((c) => remove.has(c));
    if (hits.length) {
      dropXmp = true;
      hits.forEach((c) => removed.add(c));
    }
  }
  const trailerItems = j.trailer.length ? splitTrailer(j.trailer, motionVideoLength).filter((i) => i.bytes.length) : [];
  const dropTrailer = trailerItems.length > 0 && remove.has('hidden');
  if (dropTrailer) {
    removed.add('hidden');
    if (xmpSegs.length && !dropXmp) {
      // XMP would point at media that no longer exists; drop it too.
      for (const s of xmpSegs) {
        const a = analyzeXmp(new TextDecoder().decode(s.payload.subarray(XMP_ID.length)));
        if (a.categories.has('hidden')) dropXmp = true;
      }
    }
  }
  if (dropXmp && xmpSegs.length) notes.push('The XMP metadata block was removed as a whole.');

  for (const s of j.head) {
    const raw = b.subarray(s.start, s.end);
    switch (s.kind) {
      case 'exif': {
        const tiff = parseTiff(s.payload.subarray(6));
        if (!tiff) {
          if (remove.has('other')) removed.add('other');
          else parts.push(raw);
          break;
        }
        const present = tiffCategories(tiff);
        const needs = [...present].some((c) => remove.has(c)) || exifOverride !== undefined || tiff.ifds.exif?.some((e) => e.tag === 0x927c && remove.has('device'));
        if (!needs) {
          parts.push(raw);
          break;
        }
        const r = buildTiff(tiff, { remove, orientation: exifOverride?.orientation, dimensions: exifOverride?.dimensions });
        r.removed.forEach((c) => removed.add(c));
        notes.push(...r.notes);
        if (r.bytes) {
          const payload = concat([EXIF_HEADER, r.bytes]);
          if (payload.length + 2 > 0xffff) throw new Error('Rewritten EXIF block is too large for a JPEG segment');
          parts.push(segment(0xe1, payload));
        }
        break;
      }
      case 'xmp':
      case 'xmpext':
        if (dropXmp) break;
        parts.push(raw);
        break;
      case 'iptc': {
        const a = analyzeIrb(s.payload, 'iptc');
        const xmpCats = a.xmp ? analyzeXmp(new TextDecoder().decode(a.xmp)).categories : new Set<Category>();
        const cats = new Set([...a.categories, ...xmpCats]);
        const hits = [...cats].filter((c) => remove.has(c));
        if (hits.length) {
          hits.forEach((c) => removed.add(c));
          notes.push('The IPTC/Photoshop block was removed as a whole.');
        } else parts.push(raw);
        break;
      }
      case 'mpf':
        if (dropTrailer) break;
        parts.push(raw);
        break;
      case 'jumbf':
        if (remove.has('provenance')) removed.add('provenance');
        else parts.push(raw);
        break;
      case 'com':
        if (remove.has('descriptions')) removed.add('descriptions');
        else parts.push(raw);
        break;
      case 'jfxx':
        if (remove.has('thumbnail')) removed.add('thumbnail');
        else parts.push(raw);
        break;
      case 'app':
        if (remove.has('other')) removed.add('other');
        else parts.push(raw);
        break;
      default:
        parts.push(raw); // JFIF, ICC, Adobe, DQT, DHT, SOF, DRI ...
    }
  }
  parts.push(b.subarray(j.scanStart, j.imageEnd));
  if (j.trailer.length && !dropTrailer) parts.push(j.trailer);
  return { bytes: concat(parts), removed, retained: [], notes };
}

