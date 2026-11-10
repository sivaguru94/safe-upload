import type { Category } from './types.js';

export interface FileNameFinding {
  category: Category;
  label: string;
  value: string;
}

export interface FileNameReport {
  name: string;
  findings: FileNameFinding[];
  /** True when the name itself gives something away. */
  revealing: boolean;
}

const d8 = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const t6 = (s: string) => `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;

interface Rule {
  re: RegExp;
  apply(m: RegExpExecArray): FileNameFinding[];
}

const RULES: Rule[] = [
  {
    re: /^PXL_(\d{8})_(\d{6})\d*(?:\.(MP|PORTRAIT|NIGHT|LONG_EXPOSURE[A-Z_]*|RAW-\d+))*/i,
    apply: (m) => [
      { category: 'device', label: 'Camera app', value: 'Google Pixel camera' },
      { category: 'time', label: 'Taken (from file name, UTC)', value: `${d8(m[1])} ${t6(m[2])}` },
      ...(/\.MP\b/i.test(m[0]) ? [{ category: 'hidden' as Category, label: 'Motion photo marker', value: '".MP" means a short video is stored inside this photo' }] : []),
    ],
  },
  { re: /^MVIMG_(\d{8})_(\d{6})/i, apply: (m) => [{ category: 'device', label: 'Camera app', value: 'Google camera (motion photo)' }, { category: 'time', label: 'Taken (from file name)', value: `${d8(m[1])} ${t6(m[2])}` }, { category: 'hidden', label: 'Motion photo marker', value: 'A short video is stored inside this photo' }] },
  { re: /^IMG-(\d{8})-WA\d+/i, apply: (m) => [{ category: 'software', label: 'Shared via', value: 'WhatsApp (Android)' }, { category: 'time', label: 'Date (from file name)', value: d8(m[1]) }] },
  { re: /^WhatsApp Image (\d{4}-\d{2}-\d{2}) at (\d{1,2})[.:](\d{2})[.:](\d{2})/i, apply: (m) => [{ category: 'software', label: 'Shared via', value: 'WhatsApp' }, { category: 'time', label: 'Received (from file name)', value: `${m[1]} ${m[2].padStart(2, '0')}:${m[3]}:${m[4]}` }] },
  { re: /^signal-(\d{4}-\d{2}-\d{2})-(\d{6})/i, apply: (m) => [{ category: 'software', label: 'Shared via', value: 'Signal' }, { category: 'time', label: 'Saved (from file name)', value: `${m[1]} ${t6(m[2])}` }] },
  { re: /^photo_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/i, apply: (m) => [{ category: 'software', label: 'Shared via', value: 'Telegram' }, { category: 'time', label: 'Saved (from file name)', value: `${m[1]} ${m[2]}:${m[3]}:${m[4]}` }] },
  {
    re: /^Screenshot_(\d{8})[-_](\d{6})(?:_(.+?))?(?:\.\w+)?$/i,
    apply: (m) => [
      { category: 'software', label: 'Screenshot', value: 'Android screenshot' },
      { category: 'time', label: 'Taken (from file name)', value: `${d8(m[1])} ${t6(m[2])}` },
      ...(m[3] ? [{ category: 'software' as Category, label: 'App on screen', value: m[3].replace(/_/g, ' ') }] : []),
    ],
  },
  { re: /^Screen ?shot (\d{4}-\d{2}-\d{2}) at (\d{1,2})[.:](\d{2})[.:](\d{2})/i, apply: (m) => [{ category: 'software', label: 'Screenshot', value: 'macOS screenshot' }, { category: 'time', label: 'Taken (from file name)', value: `${m[1]} ${m[2].padStart(2, '0')}:${m[3]}:${m[4]}` }] },
  { re: /^Screenshot (\d{4}-\d{2}-\d{2}) (\d{6})/i, apply: (m) => [{ category: 'software', label: 'Screenshot', value: 'Windows screenshot' }, { category: 'time', label: 'Taken (from file name)', value: `${m[1]} ${t6(m[2])}` }] },
  { re: /^(?:IMG|VID)_(\d{8})_(\d{6})/i, apply: (m) => [{ category: 'device', label: 'Camera app', value: 'Android phone camera' }, { category: 'time', label: 'Taken (from file name)', value: `${d8(m[1])} ${t6(m[2])}` }] },
  { re: /^(\d{8})_(\d{6})(?:\(\d+\))?(?:\.\w+)?$/, apply: (m) => [{ category: 'device', label: 'Camera app', value: 'Samsung phone camera' }, { category: 'time', label: 'Taken (from file name)', value: `${d8(m[1])} ${t6(m[2])}` }] },
  { re: /^IMG_E\d{4}/i, apply: () => [{ category: 'device', label: 'Camera app', value: 'iPhone or iPad camera' }, { category: 'history', label: 'Edited', value: '"IMG_E" means it was edited on the device' }] },
  { re: /^IMG_\d{4}(?:\.\w+)?$/i, apply: () => [{ category: 'device', label: 'Camera app', value: 'iPhone, iPad or camera numbering' }] },
  { re: /^(DSC_|DSCN)\d+/i, apply: () => [{ category: 'device', label: 'Camera', value: 'Nikon camera numbering' }] },
  { re: /^DSCF\d+/i, apply: () => [{ category: 'device', label: 'Camera', value: 'Fujifilm camera numbering' }] },
  { re: /^(_DSC|DSC0)\d+/i, apply: () => [{ category: 'device', label: 'Camera', value: 'Sony camera numbering' }] },
  { re: /^(GOPR|GX|GH)\d{4,}/i, apply: () => [{ category: 'device', label: 'Camera', value: 'GoPro numbering' }] },
  { re: /^DJI_\d+/i, apply: () => [{ category: 'device', label: 'Camera', value: 'DJI drone' }] },
];

const GENERIC = /^(img|image|photo|picture|pic|download|untitled|unnamed|file|scan|capture|edited|copy|final|clean|crop(ped)?|new|\d+|[a-f0-9-]{16,}|[\s_\-().0-9]+)$/i;

/**
 * Browsers send the file name with every upload. Camera apps and messengers write the date,
 * device and app into it, and people often name files after places or people.
 */
export function inspectFileName(name: string): FileNameReport {
  const base = name.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  const findings: FileNameFinding[] = [];
  for (const r of RULES) {
    const m = r.re.exec(name) ?? r.re.exec(base);
    if (m) {
      findings.push(...r.apply(m));
      break;
    }
  }
  const hashLike = /^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$|^[a-f0-9]{16,}$/i.test(base);
  if (!findings.length && !hashLike) {
    const words = base.split(/[\s_\-.]+/).filter((w) => w && !GENERIC.test(w));
    if (words.length) findings.push({ category: 'descriptions', label: 'Custom file name', value: `"${base}" may describe the place, people or event` });
  }
  return { name, findings, revealing: findings.length > 0 };
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/avif': 'avif' };

/** A name that says nothing, e.g. "photo.jpg". Use it when uploading a cleaned file. */
export function neutralFileName(mime: string, base = 'photo'): string {
  return `${base}.${EXT[mime] ?? 'jpg'}`;
}
