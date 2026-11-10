import { CATEGORY_INFO, inspectFileName, type Category, type Finding, type Report } from 'safe-upload';
import type { ObjectHint } from 'safe-upload/browser';
import { WORLD_PATH } from './data/worldmap.js';
import { bytes, h, s } from './dom.js';
import { compass, nearestPlace } from './geo.js';

const urls: string[] = [];
export function revokeUrls(): void {
  while (urls.length) URL.revokeObjectURL(urls.pop()!);
}
function blobUrl(b: Uint8Array, type: string): string {
  const u = URL.createObjectURL(new Blob([b as BlobPart], { type }));
  urls.push(u);
  return u;
}

function fmtDate(exif?: string, tz?: string): string | undefined {
  if (!exif) return undefined;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(exif);
  if (!m) return exif;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = `${Number(m[3])} ${months[Number(m[2]) - 1] ?? m[2]} ${m[1]}, ${m[4]}:${m[5]}`;
  return tz ? `${d} (UTC${tz})` : d;
}

const coord = (n: number) => n.toFixed(5);

export interface VerdictLine {
  k: string;
  v: string;
  /** Good news rather than a leak. */
  ok?: boolean;
}

export async function verdictLines(r: Report): Promise<VerdictLine[]> {
  const out: VerdictLine[] = [];
  const g = r.summary.gps;
  if (g) {
    const place = await nearestPlace(g.latitude, g.longitude).catch(() => null);
    const where = place ? `near ${place.name}, ${place.country}` : `${coord(g.latitude)}, ${coord(g.longitude)}`;
    out.push({ k: 'where', v: `${where} (${coord(g.latitude)}, ${coord(g.longitude)})` });
  } else if (r.categories.includes('location')) out.push({ k: 'where', v: 'place names written into the file' });
  else out.push({ k: 'where', v: 'no GPS position in the file. The picture itself can still give the place away; see "What a web search could find" below.', ok: true });
  const when = fmtDate(r.summary.capturedAt, r.summary.timeZone);
  if (when) out.push({ k: 'when', v: when });
  const dev = [r.summary.device, ...r.summary.serialNumbers.map((x) => `serial ${x}`)].filter(Boolean).join(' · ');
  if (dev) out.push({ k: 'device', v: dev });
  const list = (n: string[], max: number) => n.slice(0, max).join(', ') + (n.length > max ? ` and ${n.length - max} more` : '');
  if (r.summary.people.length) out.push({ k: 'who', v: `${list(r.summary.people, 5)} (tagged in the photo)` });
  if (r.summary.names.length) out.push({ k: 'owner', v: list(r.summary.names, 3) });
  if (r.thumbnails.length) out.push({ k: 'preview', v: 'a hidden preview of the picture, possibly before cropping' });
  for (const m of r.hidden) out.push({ k: m.kind === 'video' ? 'video' : 'extra', v: `${m.label.toLowerCase()} (${bytes(m.bytes.length)})` });
  if (r.summary.aiPrompt) out.push({ k: 'ai', v: 'the AI prompt used to make it' });
  if (r.summary.software.length) out.push({ k: 'apps', v: r.summary.software.slice(0, 2).join(', ') });
  return out;
}

export function fileNameLine(name: string): VerdictLine | null {
  const f = inspectFileName(name);
  if (!f.revealing) return null;
  return { k: 'file name', v: f.findings.map((x) => x.value).join(' · ') };
}

/** Card for what the file object itself reveals: its name and dates. */
export function renderFileCard(file: File, neutral: boolean, onNeutral: (on: boolean) => void): HTMLElement {
  const f = inspectFileName(file.name);
  const box = h('input', { type: 'checkbox', 'aria-label': 'Download with a neutral file name', id: 'neutral-name' });
  box.checked = neutral;
  box.addEventListener('change', () => onNeutral(box.checked));
  const rows: Finding[] = [
    { category: 'other', source: 'exif', key: 'file.name', label: 'File name', value: file.name, removable: true },
    ...f.findings.map((x) => ({ category: x.category, source: 'exif' as const, key: `file.${x.label}`, label: x.label, value: x.value, removable: true })),
    { category: 'other', source: 'exif', key: 'file.size', label: 'Size', value: bytes(file.size), removable: true },
  ];
  if (file.lastModified) rows.push({ category: 'time', source: 'exif', key: 'file.mtime', label: 'Last changed on this device', value: `${new Date(file.lastModified).toLocaleString()} (not sent with uploads)`, removable: true });
  return h(
    'article',
    { class: `card risk-${f.revealing ? 'medium' : 'low'}`, 'data-cat': 'file' },
    h('header', {}, h('h3', {}, 'File name & properties'), h('span', { class: `badge ${f.revealing ? 'medium' : 'low'}` }, f.revealing ? 'medium' : 'low'), h('label', { class: 'toggle' }, box, 'neutral name')),
    h('p', { class: 'desc' }, 'Browsers send the file name with every upload, and camera apps and messengers write the date, device and app into it. With "neutral name" ticked, the clean copy is saved as photo-clean.'),
    items(rows),
  );
}

/** Card for things the on-device object detector found in the picture. */
export function renderObjectsCard(hints: ObjectHint[], onHide: (kind: string, on: boolean) => void): HTMLElement {
  const body: (Node | null)[] = [];
  if (!hints.length) body.push(h('p', { class: 'desc' }, 'The detector found nothing obviously revealing, but it only knows about 80 everyday things. Check backgrounds, signs, reflections and screens yourself.'));
  for (const hint of hints) {
    const btn = hint.redactable ? h('button', { class: 'link', type: 'button' }, 'hide them') : null;
    if (btn) {
      let on = false;
      btn.addEventListener('click', () => {
        on = !on;
        btn.textContent = on ? 'show them' : 'hide them';
        onHide(hint.kind, on);
      });
    }
    body.push(h('div', { class: 'hint-row' }, h('strong', {}, hint.title), btn ? ' · ' : null, btn, h('p', { class: 'desc' }, hint.hint)));
  }
  const risky = hints.some((x) => x.redactable);
  return h(
    'article',
    { class: `card risk-${risky ? 'high' : 'medium'}`, 'data-cat': 'objects' },
    h('header', {}, h('h3', {}, 'Visible in the picture'), h('span', { class: `badge ${risky ? 'high' : 'medium'}` }, risky ? 'high' : 'medium')),
    h('p', { class: 'desc' }, 'Found on your device. Removing metadata does not hide what the picture shows.'),
    ...body.filter((n): n is Node => n !== null),
  );
}

const SEARCHES: [string, string][] = [
  ['Google Lens', 'https://lens.google.com/'],
  ['Bing Visual Search', 'https://www.bing.com/visualsearch'],
  ['TinEye', 'https://tineye.com/'],
  ['Yandex Images', 'https://yandex.com/images/'],
];

/** Card explaining reverse image search, with opt-in links. Nothing is sent from this page. */
export function renderWebCard(onCopy: () => Promise<string>): HTMLElement {
  const status = h('span', { class: 'desc', role: 'status' });
  const copy = h('button', { class: 'secondary small', type: 'button' }, 'Copy clean photo');
  copy.addEventListener('click', async () => {
    copy.setAttribute('disabled', '');
    status.textContent = await onCopy();
    copy.removeAttribute('disabled');
  });
  return h(
    'article',
    { class: 'card risk-high', 'data-cat': 'web' },
    h('header', {}, h('h3', {}, 'What a web search could find'), h('span', { class: 'badge high' }, 'high')),
    h('p', { class: 'desc' }, 'A reverse image search compares the picture itself with billions of images online, so it works even after every bit of metadata is gone. It can show:'),
    h(
      'ul',
      { class: 'plain' },
      h('li', {}, h('strong', {}, 'Where else it is posted'), ': the same photo, or others from that day, often with names and captions.'),
      h('li', {}, h('strong', {}, 'Who is in it'), ': face-search sites match a face to other photos of the same person across the web.'),
      h('li', {}, h('strong', {}, 'Where it was taken'), ': landmarks, shop signs, skylines and views are enough for search engines to name the place.'),
    ),
    h('p', { class: 'desc' }, 'Check it yourself with the clean copy. The links open each search engine in a new tab; you paste or upload the photo there, so it goes to that company under its own privacy policy. This page never searches for you.'),
    h('div', { class: 'row' }, copy, ...SEARCHES.map(([n, u]) => h('a', { class: 'secondary small', href: u, target: '_blank', rel: 'noopener noreferrer' }, `${n} ↗`))),
    status,
  );
}

function items(findings: Finding[]): HTMLElement {
  const dl = h('dl', { class: 'items' });
  const LIMIT = 8;
  findings.forEach((f, i) => {
    const dt = h('dt', {}, f.label);
    const dd = h('dd', {}, f.value);
    if (i >= LIMIT) {
      dt.hidden = true;
      dd.hidden = true;
    }
    dl.append(dt, dd);
  });
  const wrap = h('div', {}, dl);
  if (findings.length > LIMIT) {
    const more = h('button', { class: 'link more', type: 'button' }, `show all ${findings.length}`);
    more.addEventListener('click', () => {
      dl.querySelectorAll('[hidden]').forEach((e) => ((e as HTMLElement).hidden = false));
      more.remove();
    });
    wrap.append(more);
  }
  return wrap;
}

async function locationExtra(r: Report): Promise<HTMLElement | null> {
  const g = r.summary.gps;
  if (!g) return null;
  const x = g.longitude + 180;
  const y = 90 - g.latitude;
  const svg = s('svg', { viewBox: '0 6 360 146', role: 'img', 'aria-label': `Map pin at ${coord(g.latitude)}, ${coord(g.longitude)}` });
  svg.append(s('path', { d: WORLD_PATH, class: 'land' }), s('circle', { cx: x, cy: y, r: 3.2, class: 'ring' }), s('circle', { cx: x, cy: y, r: 2.6, class: 'pin' }));
  const place = await nearestPlace(g.latitude, g.longitude).catch(() => null);
  const lines: (Node | string)[] = [];
  if (place) lines.push(h('div', { class: 'place' }, `${place.km < 1 ? 'In' : 'Near'} ${place.name}, ${place.country} `, h('small', {}, place.km < 1 ? '' : `(${place.km < 10 ? place.km.toFixed(1) : Math.round(place.km)} km)`)));
  const detail = [`${coord(g.latitude)}, ${coord(g.longitude)}`];
  if (g.altitude !== undefined) detail.push(`${Math.round(g.altitude)} m above sea level`);
  if (g.direction !== undefined) detail.push(`camera facing ${compass(g.direction)}`);
  lines.push(h('div', { class: 'desc' }, detail.join(' · ')));
  const osm = `https://www.openstreetmap.org/?mlat=${g.latitude.toFixed(6)}&mlon=${g.longitude.toFixed(6)}#map=16/${g.latitude.toFixed(6)}/${g.longitude.toFixed(6)}`;
  lines.push(h('div', { class: 'desc' }, h('a', { href: osm, rel: 'noopener noreferrer', target: '_blank' }, 'open in OpenStreetMap ↗'), ' (this sends the coordinates to openstreetmap.org)'));
  return h('div', { class: 'map' }, svg, h('div', {}, ...lines));
}

function mediaExtra(r: Report, cat: Category): HTMLElement | null {
  if (cat === 'thumbnail' && r.thumbnails.length) {
    return h('div', { class: 'media-grid' }, ...r.thumbnails.map((t) => h('figure', {}, h('img', { src: blobUrl(t, 'image/jpeg'), alt: 'Preview image stored inside the file' }), h('figcaption', {}, `Stored inside the file (${bytes(t.length)}). Compare it with your photo.`))));
  }
  if (cat === 'hidden' && r.hidden.length) {
    return h(
      'div',
      { class: 'media-grid' },
      ...r.hidden.map((m) => {
        if (m.kind === 'video') return h('figure', {}, h('video', { src: blobUrl(m.bytes, m.mime), controls: true, muted: true, playsinline: true, loop: true }), h('figcaption', {}, `${m.label} · ${bytes(m.bytes.length)}`));
        if (m.kind === 'image') return h('figure', {}, h('img', { src: blobUrl(m.bytes, m.mime), alt: m.label }), h('figcaption', {}, `${m.label} · ${bytes(m.bytes.length)}`));
        return h('figure', {}, h('figcaption', {}, `${m.label} · ${bytes(m.bytes.length)}`));
      }),
    );
  }
  if (cat === 'ai' && r.summary.aiPrompt) return h('pre', { class: 'prompt-text' }, r.summary.aiPrompt);
  if (cat === 'people') {
    const people = [...new Set(r.findings.filter((f) => f.category === 'people').flatMap((f) => f.value.split(/,\s*/)))].filter((x) => x && x.length < 60 && !/entries|^\d/.test(x));
    if (people.length) return h('div', { class: 'chips' }, ...people.map((p) => h('span', { class: 'chip hot' }, p)));
  }
  if (cat === 'device' && r.summary.serialNumbers.length) return h('div', { class: 'chips' }, ...r.summary.serialNumbers.map((p) => h('span', { class: 'chip hot' }, `serial ${p}`)));
  return null;
}

export async function renderCards(r: Report, selected: Set<Category>, onToggle: (c: Category, on: boolean) => void): Promise<HTMLElement[]> {
  const cards: HTMLElement[] = [];
  for (const cat of r.categories) {
    const info = CATEGORY_INFO[cat];
    const findings = r.findings.filter((f) => f.category === cat);
    const box = h('input', { type: 'checkbox', 'aria-label': `Remove ${info.label}` });
    box.checked = selected.has(cat);
    box.addEventListener('change', () => onToggle(cat, box.checked));
    const extra = cat === 'location' ? await locationExtra(r) : mediaExtra(r, cat);
    const unremovable = findings.filter((f) => !f.removable);
    cards.push(
      h(
        'article',
        { class: `card risk-${info.risk}`, 'data-cat': cat },
        h('header', {}, h('h3', {}, info.label), h('span', { class: `badge ${info.risk}` }, info.risk), h('label', { class: 'toggle' }, box, 'remove')),
        h('p', { class: 'desc' }, info.description),
        extra,
        items(findings),
        unremovable.length ? h('p', { class: 'retained' }, `${unremovable.length} item${unremovable.length > 1 ? 's' : ''} here cannot be removed from this format without converting the photo.`) : null,
      ),
    );
  }
  return cards;
}
