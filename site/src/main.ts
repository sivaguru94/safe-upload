import './style.css';
import { CATEGORY_INFO, inspect, strip, type Category, type Report } from 'safe-upload';
import { $, bytes, h, s } from './dom.js';
import { loadCities } from './geo.js';
import { renderCards, revokeUrls, verdictLines } from './report.js';

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  on: boolean;
  manual: boolean;
}

const state: {
  file?: File;
  report?: Report;
  selected: Set<Category>;
  regions: Region[];
  w: number;
  h: number;
  previewUrl?: string;
  downloadUrl?: string;
  drawing: boolean;
} = { selected: new Set(), regions: [], w: 0, h: 0, drawing: false };

const FACE_OPTS = { wasmBaseUrl: '/mediapipe/', modelAssetUrl: '/models/blaze_face_full_range.tflite' };

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
  const r = await fetch('/sample/crew.jpg');
  const blob = await r.blob();
  open(new File([blob], 'sample-crew.jpg', { type: 'image/jpeg' }));
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
  state.file = file;
  state.report = report;
  state.regions = [];
  state.selected = new Set(report.categories.filter((c) => CATEGORY_INFO[c].defaultRemove));
  $('verify').hidden = true;
  $('result').hidden = false;

  const img = $('preview-img') as HTMLImageElement;
  state.previewUrl = URL.createObjectURL(file);
  $('no-preview').hidden = true;
  img.hidden = false;
  setFaceTools(true);
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
    setFaceTools(false);
  };
  img.src = state.previewUrl;

  const dims = report.width && report.height ? ` · ${report.width}×${report.height}` : '';
  $('file-meta').textContent = `${file.name} · ${report.format.toUpperCase()} · ${bytes(report.size)}${dims}`;

  await renderVerdict(report);
  await renderReport();
  updateNote();
  $('result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

async function renderVerdict(r: Report) {
  const v = $('verdict');
  v.replaceChildren();
  const lines = await verdictLines(r);
  if (!r.categories.length) {
    v.classList.add('clean');
    v.append(h('h2', {}, '✓ Nothing revealing found'), h('p', {}, 'This photo carries no location, device, name or other private metadata that we could find. You can still hide faces before sharing.'));
    return;
  }
  v.classList.remove('clean');
  const kinds = r.categories.filter((c) => c !== 'settings').length;
  v.append(h('h2', {}, `This photo reveals ${kinds} kind${kinds === 1 ? '' : 's'} of hidden data`));
  if (lines.length) v.append(h('ul', {}, ...lines.map((l) => h('li', {}, h('span', { class: 'k' }, l.k), h('span', { class: 'v' }, l.v)))));
}

async function renderReport() {
  const r = state.report!;
  const cards = await renderCards(r, state.selected, (c, on) => {
    if (on) state.selected.add(c);
    else state.selected.delete(c);
    updateNote();
  });
  $('cards').replaceChildren(...cards);
}

function setAll(on: boolean) {
  const r = state.report;
  if (!r) return;
  state.selected = on ? new Set(r.categories) : new Set();
  document.querySelectorAll<HTMLInputElement>('#cards input[type=checkbox]').forEach((b) => (b.checked = on));
  updateNote();
}
$('select-all').addEventListener('click', () => setAll(true));
$('select-none').addEventListener('click', () => setAll(false));

function activeRegions() {
  return state.regions.filter((r) => r.on);
}

function updateNote() {
  const n = state.selected.size;
  const faces = activeRegions().length;
  const parts: string[] = [];
  if (n) parts.push(`Removes ${n} kind${n === 1 ? '' : 's'} of metadata`);
  if (faces) parts.push(`hides ${faces} area${faces === 1 ? '' : 's'} (the picture is re-encoded)`);
  else parts.push('picture quality stays exactly the same');
  $('action-note').textContent = parts.join(', ') + '. Everything happens on this device.';
}

// ------------------------------------------------------------------ faces & boxes
function setFaceTools(enabled: boolean) {
  ($('scan') as HTMLButtonElement).disabled = !enabled;
  ($('draw') as HTMLButtonElement).disabled = !enabled;
  $('scan').textContent = 'Scan for faces';
}

function drawRegions() {
  const svg = $('overlay') as unknown as SVGSVGElement;
  svg.replaceChildren();
  state.regions.forEach((r, i) => {
    const rect = s('rect', { x: r.x, y: r.y, width: r.width, height: r.height, rx: Math.min(r.width, r.height) * 0.3, class: `box${r.on ? '' : ' off'}${r.manual ? ' manual' : ''}` });
    rect.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.drawing) return;
      state.regions[i].on = !state.regions[i].on;
      drawRegions();
      updateNote();
    });
    svg.append(rect);
  });
}

$('scan').addEventListener('click', async () => {
  const btn = $('scan') as HTMLButtonElement;
  const img = $('preview-img') as HTMLImageElement;
  btn.disabled = true;
  btn.textContent = 'Loading detector…';
  $('face-hint').textContent = 'Downloading the face detector from this site (about 5 MB, once). It runs on your device.';
  try {
    const { detectFaces, pad, faceDetectionSupported } = await import('safe-upload/browser');
    if (!faceDetectionSupported()) {
      $('face-hint').textContent = 'Face detection needs WebGL, which is turned off in this browser. Use "Draw a box" to cover faces yourself; hiding still happens on your device.';
      btn.textContent = 'Face scan unavailable';
      btn.disabled = true;
      return;
    }
    btn.textContent = 'Scanning…';
    await new Promise((r) => setTimeout(r, 30));
    const faces = await detectFaces(img, FACE_OPTS);
    state.regions = state.regions.filter((r) => r.manual).concat(faces.map((f) => ({ ...pad(f, 0.22, state.w, state.h), on: true, manual: false })));
    drawRegions();
    updateNote();
    $('face-hint').textContent = faces.length
      ? `Found ${faces.length} face${faces.length === 1 ? '' : 's'}. They will be hidden in the download. Click a box to keep that face visible. Check the picture: detection can miss faces, so draw a box over anything it missed.`
      : 'No faces found. Detection can miss small or turned faces; use "Draw a box" to hide anything yourself.';
    btn.textContent = 'Scan again';
  } catch (err) {
    $('face-hint').textContent = `Face scan failed: ${err instanceof Error ? err.message : String(err)}`;
    btn.textContent = 'Scan for faces';
  } finally {
    if (btn.textContent !== 'Face scan unavailable') btn.disabled = false;
  }
});

$('draw').addEventListener('click', () => {
  state.drawing = !state.drawing;
  $('draw').setAttribute('aria-pressed', String(state.drawing));
  ($('overlay') as unknown as SVGSVGElement).classList.toggle('drawing', state.drawing);
  $('face-hint').textContent = state.drawing ? 'Drag on the picture to cover anything you want hidden. Click "Draw a box" again when done.' : $('face-hint').textContent;
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
    const r = { x: Math.max(0, Math.min(start.x, p.x)), y: Math.max(0, Math.min(start.y, p.y)), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y), on: true, manual: true };
    start = null;
    ghost = null;
    if (r.width > 6 && r.height > 6) state.regions.push(r);
    drawRegions();
    updateNote();
  });
}

// ------------------------------------------------------------------ download & verify
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/avif': 'avif' };

$('download').addEventListener('click', async () => {
  const file = state.file;
  const before = state.report;
  if (!file || !before) return;
  const btn = $('download') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Cleaning…';
  try {
    const remove = [...state.selected];
    const regions = activeRegions();
    let blob: Blob;
    let lossless = false;
    let retainedNotes: string[] = [];
    if (regions.length) {
      const { redact } = await import('safe-upload/browser');
      const style = ($('style') as HTMLSelectElement).value as 'pixelate' | 'blur' | 'solid';
      blob = (await redact(file, regions, { remove, style })).blob;
    } else {
      const r = await strip(file, { remove });
      blob = new Blob([r.bytes as BlobPart], { type: r.mime });
      lossless = true;
      retainedNotes = r.retained.map((f) => f.label);
    }
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    const name = `${base}-clean.${EXT[blob.type] ?? 'jpg'}`;
    if (state.downloadUrl) URL.revokeObjectURL(state.downloadUrl);
    state.downloadUrl = URL.createObjectURL(blob);
    const a = h('a', { href: state.downloadUrl, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    await showVerification(before, blob, name, lossless, regions.length, retainedNotes);
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Download clean photo';
  }
});

async function showVerification(before: Report, blob: Blob, name: string, lossless: boolean, hidden: number, retained: string[]) {
  const after = await inspect(blob);
  const gone = before.categories.filter((c) => !after.categories.includes(c));
  const kept = after.categories;
  const v = $('verify');
  const dlLink = h('a', { href: state.downloadUrl!, download: name }, name);
  const nodes: (Node | null)[] = [
    h('h3', {}, '✓ Clean copy saved'),
    h('p', {}, 'We re-read the downloaded file with the same engine: ', dlLink, ` (${bytes(blob.size)}).`),
    gone.length ? h('ul', {}, ...gone.map((c) => h('li', {}, `${CATEGORY_INFO[c].label}: removed`))) : null,
    kept.length ? h('p', {}, `Still in the file because you kept them: ${kept.map((c) => CATEGORY_INFO[c].label).join(', ')}.`) : h('p', {}, 'No revealing metadata is left in the file.'),
    retained.length ? h('p', { class: 'retained' }, `Could not remove in this format: ${retained.join(', ')}.`) : null,
    h('p', { class: 'desc' }, lossless ? 'The picture itself is byte-for-byte unchanged: only metadata was cut out.' : `${hidden} area${hidden === 1 ? '' : 's'} hidden; the picture was re-encoded at high quality.`),
  ];
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

// Prefetch place names when idle so the page also works offline after load.
const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(cb) : setTimeout(cb, 1500));
idle(() => void loadCities().catch(() => undefined));
