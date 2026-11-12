import './style.css';
import { CATEGORY_INFO, inspect, neutralFileName, strip, type Category, type Report } from 'safe-upload';
import type { ObjectHint } from 'safe-upload/browser';
import { $, bytes, h, s } from './dom.js';
import { loadCities } from './geo.js';
import { fileNameLine, renderCards, renderFileCard, renderObjectsCard, renderWebCard, revokeUrls, verdictLines, type VerdictLine } from './report.js';

type Kind = 'face' | 'object' | 'manual';
interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  on: boolean;
  kind: Kind;
  label?: string;
  group?: string;
}

const state: {
  file?: File;
  report?: Report;
  selected: Set<Category>;
  regions: Region[];
  hints?: ObjectHint[];
  neutral: boolean;
  w: number;
  h: number;
  previewUrl?: string;
  downloadUrl?: string;
  drawing: boolean;
} = { selected: new Set(), regions: [], neutral: true, w: 0, h: 0, drawing: false };

const WASM = '/mediapipe/';
const FACE_MODEL = '/models/blaze_face_full_range.tflite';
const OBJECT_MODEL = '/models/efficientdet_lite0.tflite';

// ------------------------------------------------------------------ theme
const root = document.documentElement;
function setTheme(t: string) {
  root.dataset.theme = t;
  try {
    localStorage.setItem('reveal-theme', t);
  } catch {
    /* storage may be blocked */
  }
}
try {
  const saved = localStorage.getItem('reveal-theme');
  if (saved) root.dataset.theme = saved;
  else if (matchMedia('(prefers-color-scheme: light)').matches) root.dataset.theme = 'light';
} catch {
  /* ignore */
}
$('theme').addEventListener('click', () => setTheme(root.dataset.theme === 'light' ? 'dark' : 'light'));
$('csp').textContent = __CSP__.split('; ').join(';\n');

// ------------------------------------------------------------------ input
const drop = $('drop');
const input = $('file') as HTMLInputElement;
input.addEventListener('change', () => input.files?.[0] && open(input.files[0]));
for (const ev of ['dragenter', 'dragover'] as const)
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
for (const ev of ['dragleave', 'drop'] as const) drop.addEventListener(ev, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) open(f);
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f && !$('result').hidden) open(f);
});
window.addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
  if (f) open(f);
});
$('sample').addEventListener('click', async () => {
  const blob = await (await fetch('/sample/crew.jpg')).blob();
  open(new File([blob], 'sample-crew.jpg', { type: 'image/jpeg', lastModified: Date.UTC(2024, 9, 18, 8, 12, 40) }));
});

function showError(msg: string) {
  const e = $('error');
  e.textContent = msg;
  e.hidden = false;
}

// ------------------------------------------------------------------ analyse
async function open(file: File) {
  $('error').hidden = true;
  let report: Report;
  try {
    report = await inspect(file);
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
    return;
  }
  revokeUrls();
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  Object.assign(state, { file, report, regions: [], hints: undefined, drawing: false });
  state.selected = new Set(report.categories.filter((c) => CATEGORY_INFO[c].defaultRemove));
  $('verify').hidden = true;
  $('result').hidden = false;
  $('draw').setAttribute('aria-pressed', 'false');
  $('face-hint').textContent = 'Optional. The detectors (about 10 MB) download once from this site and run on your device. Click a box to switch it on or off.';

  const img = $('preview-img') as HTMLImageElement;
  state.previewUrl = URL.createObjectURL(file);
  $('no-preview').hidden = true;
  img.hidden = false;
  setScanTools(true);
  img.onload = () => {
    state.w = img.naturalWidth;
    state.h = img.naturalHeight;
    const svg = $('overlay') as unknown as SVGSVGElement;
    svg.setAttribute('viewBox', `0 0 ${state.w} ${state.h}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    drawRegions();
  };
  img.onerror = () => {
    img.hidden = true;
    $('no-preview').hidden = false;
    setScanTools(false);
  };
  img.src = state.previewUrl;

  const dims = report.width && report.height ? ` · ${report.width}×${report.height}` : '';
  $('file-meta').textContent = `${file.name} · ${report.format.toUpperCase()} · ${bytes(report.size)}${dims}`;
  // iOS hands web pages a JPEG named IMG_1234.jpeg when a HEIC is picked from Photos (camera originals end in .JPG/.HEIC).
  $('ios-note').hidden = !(report.format === 'jpeg' && /^IMG_\d{4}\.jpeg$/.test(file.name));

  await renderVerdict();
  await renderReport();
  updateNote();
  $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

async function renderVerdict() {
  const r = state.report!;
  const v = $('verdict');
  v.replaceChildren();
  const lines: VerdictLine[] = await verdictLines(r);
  const fn = fileNameLine(state.file!.name);
  if (fn) lines.push(fn);
  const leaks = lines.filter((l) => !l.ok);
  const kinds = r.categories.filter((c) => c !== 'settings').length + (fn ? 1 : 0);
  v.classList.toggle('clean', kinds === 0);
  v.append(h('h2', {}, kinds ? `This photo reveals ${kinds} kind${kinds === 1 ? '' : 's'} of hidden data` : '✓ No revealing metadata found'));
  if (!kinds) v.append(h('p', {}, 'No location, device or name data in the file. What the picture shows can still identify people and places; see the cards below.'));
  const ordered = [...leaks, ...lines.filter((l) => l.ok)];
  if (ordered.length) v.append(h('ul', {}, ...ordered.map((l) => h('li', { class: l.ok ? 'ok' : '' }, h('span', { class: 'k' }, l.k), h('span', { class: 'v' }, l.v)))));
}

async function renderReport() {
  const r = state.report!;
  const meta = await renderCards(r, state.selected, (c, on) => {
    if (on) state.selected.add(c);
    else state.selected.delete(c);
    updateNote();
  });
  const fileCard = renderFileCard(state.file!, state.neutral, (on) => (state.neutral = on));
  const objects = state.hints ? renderObjectsCard(state.hints, toggleGroup) : null;
  const web = renderWebCard(copyClean);
  $('cards').replaceChildren(...[objects, ...meta, fileCard, web].filter((n): n is HTMLElement => n !== null));
}

function setAll(on: boolean) {
  const r = state.report;
  if (!r) return;
  state.selected = on ? new Set(r.categories) : new Set();
  document.querySelectorAll<HTMLInputElement>('#cards .card:not([data-cat=file]) input[type=checkbox]').forEach((b) => (b.checked = on));
  updateNote();
}
$('select-all').addEventListener('click', () => setAll(true));
$('select-none').addEventListener('click', () => setAll(false));

const activeRegions = () => state.regions.filter((r) => r.on);

function updateNote() {
  const n = state.selected.size;
  const areas = activeRegions().length;
  const parts: string[] = [];
  if (n) parts.push(`Removes ${n} kind${n === 1 ? '' : 's'} of metadata`);
  if (areas) parts.push(`hides ${areas} area${areas === 1 ? '' : 's'} (the picture is re-encoded)`);
  else parts.push('picture quality stays exactly the same');
  $('action-note').textContent = parts.join(', ') + '. Everything happens on this device.';
}

// ------------------------------------------------------------------ detection & boxes
function setScanTools(enabled: boolean) {
  ($('scan') as HTMLButtonElement).disabled = !enabled;
  ($('draw') as HTMLButtonElement).disabled = !enabled;
  $('scan').textContent = 'Scan the picture';
}

function drawRegions() {
  const svg = $('overlay') as unknown as SVGSVGElement;
  svg.replaceChildren();
  state.regions.forEach((r) => {
    const rect = s('rect', { x: r.x, y: r.y, width: r.width, height: r.height, rx: Math.min(r.width, r.height) * (r.kind === 'face' ? 0.3 : 0.08), class: `box ${r.kind}${r.on ? '' : ' off'}` });
    if (r.label) {
      const t = s('title');
      t.textContent = `${r.label}: click to ${r.on ? 'keep visible' : 'hide'}`;
      rect.append(t);
    }
    rect.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.drawing) return;
      r.on = !r.on;
      drawRegions();
      updateNote();
    });
    svg.append(rect);
  });
}

function toggleGroup(kind: string, on: boolean) {
  for (const r of state.regions) if (r.group === kind) r.on = on;
  drawRegions();
  updateNote();
}

$('scan').addEventListener('click', async () => {
  const btn = $('scan') as HTMLButtonElement;
  const img = $('preview-img') as HTMLImageElement;
  btn.disabled = true;
  btn.textContent = 'Loading detectors…';
  const hint = $('face-hint');
  hint.textContent = 'Downloading the detectors from this site (about 10 MB, once). They run on your device.';
  try {
    const { detectFaces, detectObjects, objectHints, pad, visionSupported } = await import('safe-upload/browser');
    if (!visionSupported()) {
      hint.textContent = 'On-device detection needs WebGL, which is turned off in this browser. Use "Draw a box" to cover faces and anything else yourself; hiding still happens on your device.';
      btn.textContent = 'Scan unavailable';
      return;
    }
    btn.textContent = 'Scanning…';
    await new Promise((r) => setTimeout(r, 30));
    const faces = await detectFaces(img, { wasmBaseUrl: WASM, modelAssetUrl: FACE_MODEL });
    const objects = await detectObjects(img, { wasmBaseUrl: WASM, modelAssetUrl: OBJECT_MODEL });
    state.hints = objectHints(objects);
    const objectRegions: Region[] = state.hints
      .filter((x) => x.redactable)
      .flatMap((x) => x.objects.map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height, on: false, kind: 'object' as Kind, label: o.label, group: x.kind })));
    state.regions = [
      ...state.regions.filter((r) => r.kind === 'manual'),
      ...faces.map((f) => ({ ...pad(f, 0.22, state.w, state.h), on: true, kind: 'face' as Kind, label: 'face' })),
      ...objectRegions,
    ];
    drawRegions();
    await renderReport();
    updateNote();
    const extra = objectRegions.length ? ` Dashed boxes mark ${objectRegions.length} thing${objectRegions.length === 1 ? '' : 's'} that may need hiding (screens, vehicles, papers); click to hide.` : '';
    hint.textContent =
      (faces.length ? `Found ${faces.length} face${faces.length === 1 ? '' : 's'}; they will be hidden in the download. Click a box to keep that face visible.` : 'No faces found.') +
      extra +
      ' Detection can miss things: draw a box over anything it missed.';
    btn.textContent = 'Scan again';
  } catch (err) {
    hint.textContent = `Scan failed: ${err instanceof Error ? err.message : String(err)}`;
    btn.textContent = 'Scan the picture';
  } finally {
    if (btn.textContent !== 'Scan unavailable') btn.disabled = false;
  }
});

$('draw').addEventListener('click', () => {
  state.drawing = !state.drawing;
  $('draw').setAttribute('aria-pressed', String(state.drawing));
  ($('overlay') as unknown as SVGSVGElement).classList.toggle('drawing', state.drawing);
  if (state.drawing) $('face-hint').textContent = 'Drag on the picture to cover anything you want hidden. Click "Draw a box" again when done.';
});

{
  const svg = $('overlay') as unknown as SVGSVGElement;
  let start: { x: number; y: number } | null = null;
  let ghost: SVGRectElement | null = null;
  const toImage = (e: PointerEvent) => {
    const b = svg.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * state.w, y: ((e.clientY - b.top) / b.height) * state.h };
  };
  svg.addEventListener('pointerdown', (e) => {
    if (!state.drawing) return;
    svg.setPointerCapture(e.pointerId);
    start = toImage(e);
    ghost = s('rect', { x: start.x, y: start.y, width: 0, height: 0, class: 'box manual' });
    svg.append(ghost);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!start || !ghost) return;
    const p = toImage(e);
    ghost.setAttribute('x', String(Math.min(start.x, p.x)));
    ghost.setAttribute('y', String(Math.min(start.y, p.y)));
    ghost.setAttribute('width', String(Math.abs(p.x - start.x)));
    ghost.setAttribute('height', String(Math.abs(p.y - start.y)));
  });
  svg.addEventListener('pointerup', (e) => {
    if (!start) return;
    const p = toImage(e);
    const r: Region = { x: Math.max(0, Math.min(start.x, p.x)), y: Math.max(0, Math.min(start.y, p.y)), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y), on: true, kind: 'manual', label: 'your box' };
    start = null;
    ghost = null;
    if (r.width > 6 && r.height > 6) state.regions.push(r);
    drawRegions();
    updateNote();
  });
}

// ------------------------------------------------------------------ clean, download, verify, copy
interface Clean {
  blob: Blob;
  lossless: boolean;
  hidden: number;
  retained: string[];
  tiled?: boolean;
  downscaled?: { width: number; height: number };
}

/** Test hook: ?max-canvas=N forces the strip path on small photos. Defaults to the iOS limit. */
const MAX_CANVAS = Number(new URLSearchParams(location.search).get('max-canvas')) || undefined;

async function makeClean(): Promise<Clean> {
  const file = state.file!;
  const remove = [...state.selected];
  const regions = activeRegions();
  if (regions.length) {
    const { redact } = await import('safe-upload/browser');
    const style = ($('style') as HTMLSelectElement).value as 'pixelate' | 'blur' | 'solid';
    const r = await redact(file, regions, { remove, style, maxCanvasPixels: MAX_CANVAS });
    return { blob: r.blob, lossless: false, hidden: regions.length, retained: [], tiled: r.tiled, downscaled: r.downscaled ? { width: r.width, height: r.height } : undefined };
  }
  const r = await strip(file, { remove });
  return { blob: new Blob([r.bytes as BlobPart], { type: r.mime }), lossless: true, hidden: 0, retained: r.retained.map((f) => f.label) };
}

function downloadName(file: File, type: string): string {
  if (state.neutral) return neutralFileName(type, 'photo-clean');
  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return `${base}-clean.${neutralFileName(type).split('.').pop()}`;
}

$('download').addEventListener('click', async () => {
  const file = state.file;
  const before = state.report;
  if (!file || !before) return;
  const btn = $('download') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Cleaning…';
  try {
    const c = await makeClean();
    const name = downloadName(file, c.blob.type);
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = URL.createObjectURL(c.blob);
    const a = h('a', { href: state.downloadUrl, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    await showVerification(before, c, name);
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download clean photo';
  }
});

/** Put the clean picture on the clipboard as PNG so it can be pasted into a search engine. */
async function copyClean(): Promise<string> {
  try {
    const c = await makeClean();
    const bmp = await createImageBitmap(c.blob);
    // Search engines need no more than this, and it keeps phones under their canvas limits.
    const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
    const canvas = h('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const png = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return ' Copied. Paste it (Ctrl/Cmd+V) into the search page.';
  } catch {
    return ' Could not copy here. Download the clean photo and upload that file instead.';
  }
}

async function showVerification(before: Report, c: Clean, name: string) {
  const after = await inspect(c.blob);
  const gone = before.categories.filter((x) => !after.categories.includes(x));
  const kept = after.categories;
  const nodes: (Node | null)[] = [
    h('h3', {}, '✓ Clean copy saved'),
    h('p', {}, 'We re-read the downloaded file with the same engine: ', h('a', { href: state.downloadUrl!, download: name }, name), ` (${bytes(c.blob.size)}).`),
    gone.length ? h('ul', {}, ...gone.map((x) => h('li', {}, `${CATEGORY_INFO[x].label}: removed`))) : null,
    kept.length ? h('p', {}, `Still in the file because you kept them: ${kept.map((x) => CATEGORY_INFO[x].label).join(', ')}.`) : h('p', {}, 'No revealing metadata is left in the file.'),
    c.retained.length ? h('p', { class: 'retained' }, `Could not remove in this format: ${c.retained.join(', ')}.`) : null,
    h('p', { class: 'desc' }, c.lossless ? 'The picture itself is byte-for-byte unchanged: only metadata was cut out.' : `${c.hidden} area${c.hidden === 1 ? '' : 's'} hidden; the picture was re-encoded at high quality${c.tiled ? ', in strips to stay within this device’s limits, at full resolution' : ''}.`),
    c.downscaled ? h('p', { class: 'retained' }, `This browser could not handle the full-size picture, so the clean copy is ${c.downscaled.width}×${c.downscaled.height}.`) : null,
    h('p', { class: 'desc' }, 'Metadata is only half of it: what the picture shows can still be searched. See "What a web search could find" above.'),
  ];
  const v = $('verify');
  v.replaceChildren(...nodes.filter((n): n is Node => n !== null));
  v.hidden = false;
}

$('reset').addEventListener('click', () => {
  $('result').hidden = true;
  input.value = '';
  state.file = undefined;
  state.report = undefined;
  revokeUrls();
  $('start').scrollIntoView({ behavior: 'smooth' });
});

const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(cb) : setTimeout(cb, 1500));
idle(() => void loadCities().catch(() => undefined));
