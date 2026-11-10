import { clean, latin1, toHex, utf8 } from './bytes.js';
import { classifyTag, POINTER_TAGS, tagDef, type IfdName, type TagClass } from './exif-tags.js';
import type { Category, Finding, GpsPoint, Source } from './types.js';

/** Byte size of one value of each TIFF field type. */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4, 129: 1 };

export interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  /** Raw value bytes in the file's byte order (length = typeSize * count). */
  value: Uint8Array;
}

export interface Tiff {
  le: boolean;
  ifds: Partial<Record<IfdName, IfdEntry[]>>;
  /** JPEG thumbnail referenced from IFD1, if any. */
  thumbnail?: Uint8Array;
  /** IFD1 stores an uncompressed (strip) thumbnail we cannot relocate. */
  stripThumbnail: boolean;
  warnings: string[];
}

export function parseTiff(b: Uint8Array): Tiff | null {
  if (b.length < 8) return null;
  const le = b[0] === 0x49 && b[1] === 0x49;
  const be = b[0] === 0x4d && b[1] === 0x4d;
  if (!le && !be) return null;
  const r16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const r32 = (o: number) =>
    (le ? b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24) : (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  if (r16(2) !== 42) return null;

  const tiff: Tiff = { le, ifds: {}, stripThumbnail: false, warnings: [] };
  const seen = new Set<number>();

  const readIfd = (off: number): { entries: IfdEntry[]; next: number } | null => {
    if (off < 8 || off + 2 > b.length || seen.has(off)) return null;
    seen.add(off);
    let n = r16(off);
    const maxN = Math.floor((b.length - off - 2) / 12);
    if (n > maxN) {
      tiff.warnings.push('Truncated IFD');
      n = maxN;
    }
    const entries: IfdEntry[] = [];
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      const tag = r16(e);
      const type = r16(e + 2);
      const count = r32(e + 4);
      const size = TYPE_SIZE[type];
      if (!size) {
        tiff.warnings.push(`Unknown field type ${type} for tag ${toHex(tag)}`);
        continue;
      }
      const total = size * count;
      let value: Uint8Array;
      if (total <= 4) value = b.subarray(e + 8, e + 8 + total);
      else {
        const vo = r32(e + 8);
        if (vo + total > b.length) {
          tiff.warnings.push(`Value of tag ${toHex(tag)} points outside the EXIF block`);
          continue;
        }
        value = b.subarray(vo, vo + total);
      }
      entries.push({ tag, type, count, value });
    }
    const nextPos = off + 2 + n * 12;
    const next = nextPos + 4 <= b.length ? r32(nextPos) : 0;
    return { entries, next };
  };

  const ifd0 = readIfd(r32(4));
  if (!ifd0) return null;
  tiff.ifds.ifd0 = ifd0.entries;

  const ptr = (entries: IfdEntry[], tag: number) => {
    const e = entries.find((x) => x.tag === tag);
    if (!e || (e.type !== 4 && e.type !== 13) || e.count < 1) return 0;
    return readUint(e, le, 0);
  };
  const exifOff = ptr(ifd0.entries, POINTER_TAGS.exif);
  const exif = exifOff ? readIfd(exifOff) : null;
  if (exif) tiff.ifds.exif = exif.entries;
  const gpsOff = ptr(ifd0.entries, POINTER_TAGS.gps);
  const gps = gpsOff ? readIfd(gpsOff) : null;
  if (gps) tiff.ifds.gps = gps.entries;
  const interopOff = exif ? ptr(exif.entries, POINTER_TAGS.interop) : 0;
  const interop = interopOff ? readIfd(interopOff) : null;
  if (interop) tiff.ifds.interop = interop.entries;
  const ifd1 = ifd0.next ? readIfd(ifd0.next) : null;
  if (ifd1 && ifd1.entries.length) {
    tiff.ifds.ifd1 = ifd1.entries;
    const tOff = ptr(ifd1.entries, 0x0201);
    const tLen = ptr(ifd1.entries, 0x0202);
    if (tOff && tLen && tOff + tLen <= b.length) tiff.thumbnail = b.subarray(tOff, tOff + tLen);
    if (ifd1.entries.some((e) => e.tag === 0x0111)) tiff.stripThumbnail = true;
  }
  return tiff;
}

// ---------------------------------------------------------------- value decoding

function readUint(e: IfdEntry, le: boolean, i: number): number {
  const v = e.value;
  if (e.type === 3 || e.type === 8) {
    const o = i * 2;
    const n = le ? v[o] | (v[o + 1] << 8) : (v[o] << 8) | v[o + 1];
    return e.type === 8 && n & 0x8000 ? n - 0x10000 : n;
  }
  if (e.type === 4 || e.type === 9 || e.type === 13) {
    const o = i * 4;
    const n = (le ? v[o] | (v[o + 1] << 8) | (v[o + 2] << 16) | (v[o + 3] << 24) : (v[o] << 24) | (v[o + 1] << 16) | (v[o + 2] << 8) | v[o + 3]) >>> 0;
    return e.type === 9 ? n | 0 : n;
  }
  if (e.type === 1 || e.type === 7) return v[i];
  if (e.type === 6) return (v[i] << 24) >> 24;
  return NaN;
}

function readRational(e: IfdEntry, le: boolean, i: number): number {
  const o = i * 8;
  const v = e.value;
  const r = (p: number) => (le ? v[p] | (v[p + 1] << 8) | (v[p + 2] << 16) | (v[p + 3] << 24) : (v[p] << 24) | (v[p + 1] << 16) | (v[p + 2] << 8) | v[p + 3]);
  let num = r(o) >>> 0;
  let den = r(o + 4) >>> 0;
  if (e.type === 10) {
    num |= 0;
    den |= 0;
  }
  return den === 0 ? NaN : num / den;
}

export function entryNumbers(e: IfdEntry, le: boolean): number[] {
  const out: number[] = [];
  const n = Math.min(e.count, 64);
  for (let i = 0; i < n; i++) {
    if (e.type === 5 || e.type === 10) out.push(readRational(e, le, i));
    else if (e.type === 11) out.push(new DataView(e.value.buffer, e.value.byteOffset + i * 4, 4).getFloat32(0, le));
    else if (e.type === 12) out.push(new DataView(e.value.buffer, e.value.byteOffset + i * 8, 8).getFloat64(0, le));
    else out.push(readUint(e, le, i));
  }
  return out;
}

export function entryText(e: IfdEntry): string {
  if (e.type === 129) return clean(utf8(e.value));
  return clean(latin1(e.value));
}

function ucs2(v: Uint8Array): string {
  let s = '';
  for (let i = 0; i + 1 < v.length; i += 2) s += String.fromCharCode(v[i] | (v[i + 1] << 8));
  return clean(s);
}

function userComment(v: Uint8Array, le: boolean): string {
  if (v.length < 8) return '';
  const code = latin1(v, 0, 8);
  const body = v.subarray(8);
  if (code.startsWith('UNICODE')) {
    let s = '';
    for (let i = 0; i + 1 < body.length; i += 2) s += String.fromCharCode(le ? body[i] | (body[i + 1] << 8) : (body[i] << 8) | body[i + 1]);
    return clean(s);
  }
  return clean(code.startsWith('ASCII') ? latin1(body) : utf8(body));
}

const fmt = (n: number, d = 2) => (Number.isFinite(n) ? String(Math.round(n * 10 ** d) / 10 ** d) : '?');

function dms(e: IfdEntry, le: boolean): number {
  const [d = NaN, m = 0, s = 0] = entryNumbers(e, le);
  return d + m / 60 + s / 3600;
}

/** Human-readable value of an entry. */
export function formatEntry(ifd: IfdName, e: IfdEntry, le: boolean): string {
  const name = tagDef(ifd, e.tag)?.name;
  if (name === 'MakerNote') return `${e.value.length.toLocaleString('en')} bytes of vendor data`;
  if (name === 'UserComment') return userComment(e.value, le);
  if (name?.startsWith('XP')) return ucs2(e.value);
  if (name === 'ExposureTime') {
    const v = entryNumbers(e, le)[0];
    return v > 0 && v < 1 ? `1/${Math.round(1 / v)} s` : `${fmt(v)} s`;
  }
  if (name === 'FNumber') return `f/${fmt(entryNumbers(e, le)[0], 1)}`;
  if (name === 'FocalLength') return `${fmt(entryNumbers(e, le)[0], 1)} mm`;
  if (ifd === 'gps' && (name === 'GPSLatitude' || name === 'GPSLongitude' || name === 'GPSDestLatitude' || name === 'GPSDestLongitude'))
    return fmt(dms(e, le), 6) + '°';
  if (ifd === 'gps' && name === 'GPSTimeStamp') {
    const [h = 0, m = 0, s = 0] = entryNumbers(e, le);
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor(m)).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}`;
  }
  if (ifd === 'gps' && name === 'GPSAltitude') return `${fmt(entryNumbers(e, le)[0], 1)} m`;
  if (ifd === 'gps' && (name === 'GPSImgDirection' || name === 'GPSTrack' || name === 'GPSDestBearing')) return `${fmt(entryNumbers(e, le)[0], 0)}°`;
  if (ifd === 'gps' && name === 'GPSVersionID') return Array.from(e.value).join('.');
  if (e.type === 2 || e.type === 129) return entryText(e);
  if (e.type === 7) {
    const printable = e.value.every((c) => c === 0 || (c >= 0x20 && c < 0x7f));
    return printable && e.value.length < 128 ? entryText(e) : `${e.value.length.toLocaleString('en')} bytes`;
  }
  const nums = entryNumbers(e, le);
  const s = nums.map((n) => fmt(n, 4)).join(', ');
  return e.count > 64 ? s + ', …' : s;
}

// ---------------------------------------------------------------- analysis

/**
 * GPS tags that say nothing on their own. Cameras without a GPS receiver (most DSLRs) still write
 * a GPS block holding only these, so they must not be reported as a location.
 */
const GPS_HOUSEKEEPING = new Set([0x0000, 0x0008, 0x0009, 0x000a, 0x000b, 0x0012, 0x001b, 0x001e]);

/** True when the GPS block carries an actual position, direction, destination or area. */
export function gpsInformative(tiff: Tiff): boolean {
  return (tiff.ifds.gps ?? []).some((e) => !GPS_HOUSEKEEPING.has(e.tag));
}

/** Skip housekeeping-only GPS tags when there is no real GPS information. */
function silentGps(tiff: Tiff, ifd: IfdName, tag: number, informative: boolean): boolean {
  return ifd === 'gps' && !informative && GPS_HOUSEKEEPING.has(tag);
}

export interface ExifAnalysis {
  findings: Finding[];
  gps?: GpsPoint;
  capturedAt?: string;
  timeZone?: string;
  device?: string;
  serialNumbers: string[];
  names: string[];
  software: string[];
  orientation?: number;
  width?: number;
  height?: number;
  thumbnail?: Uint8Array;
}

const NAMES = new Set(['Artist', 'XPAuthor', 'CameraOwnerName', 'Photographer', 'ImageEditor']);
const SERIALS = new Set(['BodySerialNumber', 'LensSerialNumber', 'CameraSerialNumber', 'ImageUniqueID']);

export function analyzeTiff(tiff: Tiff, source: Source, removable = true): ExifAnalysis {
  const { le } = tiff;
  const out: ExifAnalysis = { findings: [], serialNumbers: [], names: [], software: [] };
  const get = (ifd: IfdName, tag: number) => tiff.ifds[ifd]?.find((e) => e.tag === tag);
  const informative = gpsInformative(tiff);

  for (const ifd of ['ifd0', 'exif', 'gps', 'interop', 'ifd1'] as IfdName[]) {
    for (const e of tiff.ifds[ifd] ?? []) {
      if (silentGps(tiff, ifd, e.tag, informative)) continue;
      if (ifd !== 'ifd1' && (e.tag === POINTER_TAGS.exif || e.tag === POINTER_TAGS.gps || e.tag === POINTER_TAGS.interop)) continue;
      const cls = classifyTag(ifd, e.tag);
      if (cls === 'technical') continue;
      if (ifd === 'ifd1') continue; // summarised below as one thumbnail finding
      const def = tagDef(ifd, e.tag);
      const name = def?.name ?? `Tag${toHex(e.tag)}`;
      const value = formatEntry(ifd, e, le);
      out.findings.push({
        category: cls,
        source,
        key: `exif.${name}`,
        label: def?.label ?? `Unknown ${ifd.toUpperCase()} tag ${toHex(e.tag)}`,
        value: truncate(value),
        removable,
      });
      if (NAMES.has(name) && value) out.names.push(value);
      if (SERIALS.has(name) && value) out.serialNumbers.push(value);
      if ((name === 'Software' || name.endsWith('Software')) && value) out.software.push(value);
    }
  }
  if (tiff.ifds.ifd1) {
    out.findings.push({
      category: 'thumbnail',
      source,
      key: 'exif.Thumbnail',
      label: 'Embedded thumbnail',
      value: tiff.thumbnail ? `${tiff.thumbnail.length.toLocaleString('en')} byte JPEG preview` : 'Preview image directory',
      removable,
    });
    if (tiff.thumbnail) out.thumbnail = tiff.thumbnail;
  }

  // Summaries
  const lat = get('gps', 0x0002);
  const lon = get('gps', 0x0004);
  if (lat && lon) {
    const latRef = get('gps', 0x0001);
    const lonRef = get('gps', 0x0003);
    let latitude = dms(lat, le);
    let longitude = dms(lon, le);
    if (latRef && entryText(latRef).toUpperCase().startsWith('S')) latitude = -latitude;
    if (lonRef && entryText(lonRef).toUpperCase().startsWith('W')) longitude = -longitude;
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && !(latitude === 0 && longitude === 0)) {
      const gps: GpsPoint = { latitude, longitude };
      const alt = get('gps', 0x0006);
      if (alt) {
        const ref = get('gps', 0x0005);
        const a = entryNumbers(alt, le)[0];
        if (Number.isFinite(a)) gps.altitude = ref && ref.value[0] === 1 ? -a : a;
      }
      const dir = get('gps', 0x0011);
      if (dir) {
        const d = entryNumbers(dir, le)[0];
        if (Number.isFinite(d)) gps.direction = d;
      }
      out.gps = gps;
    }
  }
  const taken = get('exif', 0x9003) ?? get('exif', 0x9004) ?? get('ifd0', 0x0132);
  if (taken) out.capturedAt = entryText(taken);
  const tz = get('exif', 0x9011) ?? get('exif', 0x9010);
  if (tz) out.timeZone = entryText(tz);
  const make = get('ifd0', 0x010f);
  const model = get('ifd0', 0x0110);
  const makeS = make ? entryText(make) : '';
  const modelS = model ? entryText(model) : '';
  if (makeS || modelS) out.device = modelS.toLowerCase().startsWith(makeS.toLowerCase()) ? modelS : `${makeS} ${modelS}`.trim();
  const orient = get('ifd0', 0x0112);
  if (orient) out.orientation = entryNumbers(orient, le)[0];
  const w = get('exif', 0xa002);
  const h = get('exif', 0xa003);
  if (w && h) {
    out.width = entryNumbers(w, le)[0];
    out.height = entryNumbers(h, le)[0];
  }
  return out;
}

export function tiffCategories(tiff: Tiff): Set<Category> {
  const s = new Set<Category>();
  const informative = gpsInformative(tiff);
  for (const ifd of ['ifd0', 'exif', 'gps', 'interop', 'ifd1'] as IfdName[]) {
    for (const e of tiff.ifds[ifd] ?? []) {
      if (silentGps(tiff, ifd, e.tag, informative)) continue;
      if (ifd !== 'ifd1' && (e.tag === POINTER_TAGS.exif || e.tag === POINTER_TAGS.gps || e.tag === POINTER_TAGS.interop)) continue;
      const c = classifyTag(ifd, e.tag);
      if (c !== 'technical') s.add(c);
    }
  }
  return s;
}

function truncate(s: string, max = 500): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ---------------------------------------------------------------- writing

export interface BuildOptions {
  remove: Set<Category>;
  /** Override orientation (used after re-encoding already-rotated pixels). */
  orientation?: number;
  /** Override pixel dimensions (used after re-encoding). */
  dimensions?: { width: number; height: number };
}

export interface BuildResult {
  bytes: Uint8Array | null;
  removed: Set<Category>;
  notes: string[];
}

/**
 * Rebuild a TIFF/EXIF block without the removed categories. Values are copied byte-for-byte in the
 * original byte order. The vendor MakerNote is always dropped on rewrite because its internal
 * offsets break when relocated. Returns bytes=null when nothing is left worth keeping.
 */
export function buildTiff(tiff: Tiff, opts: BuildOptions): BuildResult {
  const { le } = tiff;
  const removed = new Set<Category>();
  const notes: string[] = [];
  const informative = gpsInformative(tiff);
  const keep = (ifd: IfdName, e: IfdEntry): boolean => {
    if (ifd !== 'ifd1' && (e.tag === POINTER_TAGS.exif || e.tag === POINTER_TAGS.gps || e.tag === POINTER_TAGS.interop)) return false;
    if (silentGps(tiff, ifd, e.tag, informative)) return !opts.remove.has('location');
    const c: TagClass = classifyTag(ifd, e.tag);
    if (c === 'technical') return true;
    if (opts.remove.has(c)) {
      removed.add(c);
      return false;
    }
    if (ifd === 'exif' && e.tag === 0x927c) {
      notes.push('The vendor maker note was removed because it cannot be safely moved inside the file.');
      removed.add('device');
      return false;
    }
    return true;
  };

  const enc16 = (v: number) => (le ? [v & 0xff, (v >> 8) & 0xff] : [(v >> 8) & 0xff, v & 0xff]);
  const enc32 = (v: number) =>
    le ? [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff] : [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  const short = (tag: number, v: number): IfdEntry => ({ tag, type: 3, count: 1, value: new Uint8Array(enc16(v)) });
  const long = (tag: number, v: number): IfdEntry => ({ tag, type: 4, count: 1, value: new Uint8Array(enc32(v)) });

  const filtered: Partial<Record<IfdName, IfdEntry[]>> = {};
  for (const ifd of ['ifd0', 'exif', 'gps', 'interop'] as IfdName[]) {
    const src = tiff.ifds[ifd];
    if (!src) continue;
    let list = src.filter((e) => keep(ifd, e));
    if (ifd === 'ifd0' && opts.orientation !== undefined) {
      list = list.filter((e) => e.tag !== 0x0112);
      list.push(short(0x0112, opts.orientation));
    }
    if (ifd === 'exif' && opts.dimensions) {
      list = list.filter((e) => e.tag !== 0xa002 && e.tag !== 0xa003);
      list.push(long(0xa002, opts.dimensions.width), long(0xa003, opts.dimensions.height));
    }
    filtered[ifd] = list;
  }

  // Thumbnail (IFD1): keep only if not removed, it is a JPEG thumbnail, and pixels were not re-encoded.
  let thumb: Uint8Array | undefined;
  if (tiff.ifds.ifd1) {
    if (opts.remove.has('thumbnail')) removed.add('thumbnail');
    else if (opts.dimensions) {
      removed.add('thumbnail');
      notes.push('The embedded thumbnail was removed because it no longer matches the edited picture.');
    } else if (tiff.stripThumbnail || !tiff.thumbnail) {
      removed.add('thumbnail');
      notes.push('An uncompressed embedded thumbnail was removed because it cannot be moved safely.');
    } else {
      thumb = tiff.thumbnail;
      filtered.ifd1 = tiff.ifds.ifd1.filter((e) => e.tag !== 0x0201 && e.tag !== 0x0202);
    }
  }

  const hasInterop = !!filtered.interop?.length;
  if (filtered.exif && hasInterop) filtered.exif.push(long(POINTER_TAGS.interop, 0));
  const hasExif = !!filtered.exif?.length;
  const hasGps = !!filtered.gps?.length;
  if (!filtered.ifd0) filtered.ifd0 = [];
  if (hasExif) filtered.ifd0.push(long(POINTER_TAGS.exif, 0));
  if (hasGps) filtered.ifd0.push(long(POINTER_TAGS.gps, 0));
  if (thumb && filtered.ifd1) filtered.ifd1.push(long(0x0201, 0), long(0x0202, thumb.length));

  const order: IfdName[] = ['ifd0'];
  if (hasExif) order.push('exif');
  if (hasExif && hasInterop) order.push('interop');
  if (hasGps) order.push('gps');
  if (thumb && filtered.ifd1) order.push('ifd1');
  for (const n of order) filtered[n]!.sort((a, b) => a.tag - b.tag);

  const meaningful = order.some((n) => filtered[n]!.some((e) => !isPointer(n, e.tag)));
  if (!meaningful) return { bytes: null, removed, notes };

  // Layout pass
  let pos = 8;
  const ifdPos: Partial<Record<IfdName, number>> = {};
  const valuePos = new Map<IfdEntry, number>();
  for (const n of order) {
    const list = filtered[n]!;
    ifdPos[n] = pos;
    pos += 2 + list.length * 12 + 4;
    for (const e of list) {
      if (e.value.length > 4) {
        if (pos & 1) pos++;
        valuePos.set(e, pos);
        pos += e.value.length;
      }
    }
    if (pos & 1) pos++;
  }
  let thumbPos = 0;
  if (thumb && ifdPos.ifd1 !== undefined) {
    thumbPos = pos;
    pos += thumb.length;
  }

  const out = new Uint8Array(pos);
  out.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  out.set(enc16(42), 2);
  out.set(enc32(8), 4);

  const pointerValue = (n: IfdName, tag: number): number | undefined => {
    if (n === 'ifd0' && tag === POINTER_TAGS.exif) return ifdPos.exif;
    if (n === 'ifd0' && tag === POINTER_TAGS.gps) return ifdPos.gps;
    if (n === 'exif' && tag === POINTER_TAGS.interop) return ifdPos.interop;
    if (n === 'ifd1' && tag === 0x0201) return thumbPos;
    return undefined;
  };

  for (const n of order) {
    const list = filtered[n]!;
    let p = ifdPos[n]!;
    out.set(enc16(list.length), p);
    p += 2;
    for (const e of list) {
      out.set(enc16(e.tag), p);
      out.set(enc16(e.type), p + 2);
      out.set(enc32(e.count), p + 4);
      const pv = pointerValue(n, e.tag);
      if (pv !== undefined) out.set(enc32(pv), p + 8);
      else if (e.value.length > 4) out.set(enc32(valuePos.get(e)!), p + 8);
      else out.set(e.value, p + 8);
      p += 12;
    }
    const next = n === 'ifd0' && order.includes('ifd1') ? ifdPos.ifd1! : 0;
    out.set(enc32(next), p);
    for (const e of list) {
      const vp = valuePos.get(e);
      if (vp !== undefined) out.set(e.value, vp);
    }
  }
  if (thumb) out.set(thumb, thumbPos);
  return { bytes: out, removed, notes };
}

function isPointer(n: IfdName, tag: number): boolean {
  return (n === 'ifd0' && (tag === POINTER_TAGS.exif || tag === POINTER_TAGS.gps)) || (n === 'exif' && tag === POINTER_TAGS.interop);
}

/** "Exif\0\0" prefix used by JPEG APP1, WebP and HEIF Exif payloads. */
export const EXIF_HEADER = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
