import { latin1, startsWith, u16be, u32be, utf8, clean } from './bytes.js';
import type { Category, Finding, Source } from './types.js';

/** IIM record 2 datasets we classify. Unlisted datasets count as 'descriptions'. */
const DATASETS: Record<number, [string, Category | 'technical']> = {
  0: ['Record version', 'technical'],
  5: ['Object name', 'descriptions'],
  7: ['Edit status', 'descriptions'],
  10: ['Urgency', 'descriptions'],
  15: ['Category', 'descriptions'],
  20: ['Supplemental category', 'descriptions'],
  25: ['Keywords', 'descriptions'],
  40: ['Special instructions', 'descriptions'],
  55: ['Date created', 'time'],
  60: ['Time created', 'time'],
  62: ['Digital creation date', 'time'],
  63: ['Digital creation time', 'time'],
  65: ['Originating program', 'software'],
  70: ['Program version', 'software'],
  80: ['By-line', 'author'],
  85: ['By-line title', 'author'],
  90: ['City', 'location'],
  92: ['Sub-location', 'location'],
  95: ['Province/State', 'location'],
  100: ['Country code', 'location'],
  101: ['Country', 'location'],
  103: ['Original transmission reference', 'descriptions'],
  105: ['Headline', 'descriptions'],
  110: ['Credit', 'author'],
  115: ['Source', 'author'],
  116: ['Copyright notice', 'author'],
  118: ['Contact', 'author'],
  120: ['Caption', 'descriptions'],
  122: ['Caption writer', 'author'],
};

export interface IrbAnalysis {
  findings: Finding[];
  categories: Set<Category>;
  names: string[];
  thumbnail?: Uint8Array;
  /** XMP stored inside the Photoshop resources (resource 0x0424). */
  xmp?: Uint8Array;
}

/** Parse Photoshop image resources ("8BIM" blocks), optionally after a "Photoshop 3.0\0" header. */
export function analyzeIrb(b: Uint8Array, source: Source, removable = true): IrbAnalysis {
  const out: IrbAnalysis = { findings: [], categories: new Set(), names: [] };
  let p = startsWith(b, 0, 'Photoshop 3.0\0') ? 14 : 0;
  while (p + 12 <= b.length && startsWith(b, p, '8BIM')) {
    const id = u16be(b, p + 4);
    const nameLen = b[p + 6];
    let q = p + 7 + nameLen;
    if ((nameLen + 1) & 1) q++;
    if (q + 4 > b.length) break;
    const size = u32be(b, q);
    const start = q + 4;
    const end = Math.min(b.length, start + size);
    const data = b.subarray(start, end);
    if (id === 0x0404) parseIim(data, source, removable, out);
    else if (id === 0x040c || id === 0x0409) {
      out.categories.add('thumbnail');
      out.findings.push({ category: 'thumbnail', source, key: 'iptc.PhotoshopThumbnail', label: 'Photoshop thumbnail', value: `${Math.max(0, data.length - 28).toLocaleString('en')} byte preview`, removable });
      if (data.length > 28 && data[28] === 0xff && data[29] === 0xd8) out.thumbnail = data.subarray(28);
    } else if (id === 0x0424) out.xmp = data;
    else if (id === 0x0425) {
      // IPTC digest: harmless checksum
    } else if (id === 0x040f || id === 0x0422 || id === 0x0423) {
      // ICC profile / EXIF copies: EXIF copy is handled as 'other'
      if (id !== 0x040f) {
        out.categories.add('other');
        out.findings.push({ category: 'other', source, key: `iptc.irb${id.toString(16)}`, label: 'Photoshop copy of EXIF data', value: `${data.length.toLocaleString('en')} bytes`, removable });
      }
    } else if (id >= 0x07d0 && id <= 0x0bb6) {
      out.categories.add('history');
      out.findings.push({ category: 'history', source, key: 'iptc.paths', label: 'Photoshop paths', value: 'Clipping or work paths', removable });
    }
    p = end + (size & 1);
  }
  // Deduplicate path findings
  const seen = new Set<string>();
  out.findings = out.findings.filter((f) => (seen.has(f.key + f.value) ? false : (seen.add(f.key + f.value), true)));
  return out;
}

function parseIim(b: Uint8Array, source: Source, removable: boolean, out: IrbAnalysis): void {
  let p = 0;
  let isUtf8 = false;
  const values = new Map<number, string[]>();
  while (p + 5 <= b.length && b[p] === 0x1c) {
    const record = b[p + 1];
    const dataset = b[p + 2];
    let len = u16be(b, p + 3);
    let start = p + 5;
    if (len & 0x8000) {
      const n = len & 0x7fff;
      len = 0;
      for (let i = 0; i < n; i++) len = len * 256 + b[start + i];
      start += n;
    }
    const data = b.subarray(start, Math.min(b.length, start + len));
    if (record === 1 && dataset === 90 && latin1(data).includes('%G')) isUtf8 = true;
    if (record === 2) {
      const s = clean(isUtf8 ? utf8(data) : latin1(data));
      if (!values.has(dataset)) values.set(dataset, []);
      values.get(dataset)!.push(s);
    }
    p = start + len;
  }
  for (const [ds, vals] of values) {
    const [label, cls] = DATASETS[ds] ?? [`IPTC dataset 2:${ds}`, 'descriptions' as Category];
    if (cls === 'technical') continue;
    out.categories.add(cls);
    const value = vals.join(', ');
    out.findings.push({ category: cls, source, key: `iptc.2:${ds}`, label, value: value.length > 300 ? value.slice(0, 300) + '…' : value, removable });
    if (cls === 'author' && (ds === 80 || ds === 122)) out.names.push(...vals);
  }
}
