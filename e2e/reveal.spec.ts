import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspect, strip } from '../packages/safe-upload/dist/index.js';

const FIX = join(import.meta.dirname, '..', 'fixtures');
const ORIGIN = new URL(process.env.BASE_URL ?? 'http://localhost:4173').origin + '/';

/** Collect every request and every CSP or script error for the whole test. */
function watch(page: Page) {
  const requests: string[] = [];
  const problems: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (/^INFO:/.test(t)) return; // MediaPipe logs informational lines via console.error
    // Over plain HTTP on a non-localhost test host, Chromium warns that COOP is ignored; production is HTTPS.
    if (!ORIGIN.startsWith('https:') && !ORIGIN.includes('localhost') && /Cross-Origin-Opener-Policy header has been ignored/.test(t)) return;
    if (m.type() === 'error' || /Content.Security.Policy|CSP/i.test(t)) problems.push(`console ${m.type()}: ${t}`);
  });
  return {
    requests,
    problems,
    foreign: () => requests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('blob:') && !u.startsWith('data:')),
  };
}

async function upload(page: Page, file: string) {
  await page.setInputFiles('#file', join(FIX, file));
  await expect(page.locator('#result')).toBeVisible();
}

test('reveals what a JPEG gives away, and the download is the lossless strip @mobile', async ({ page }) => {
  const w = watch(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What does your photo reveal?' })).toBeVisible();
  await upload(page, 'full.jpg');
  const verdict = page.locator('#verdict');
  await expect(verdict).toContainText('Bengaluru');
  await expect(verdict).toContainText('Google Pixel 7a');
  await expect(verdict).toContainText('SN-7A-123456');
  await expect(verdict).toContainText('Jane Doe');
  await expect(page.locator('.card[data-cat=location] svg')).toBeVisible();
  await expect(page.locator('.card[data-cat=thumbnail] img')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  expect(dl.suggestedFilename()).toBe('photo-clean.jpg');
  const got = new Uint8Array(readFileSync((await dl.path())!));
  const expected = (await strip(readFileSync(join(FIX, 'full.jpg')))).bytes;
  expect(Buffer.from(got).equals(Buffer.from(expected))).toBe(true);
  const after = await inspect(got);
  expect(after.categories).not.toContain('location');
  expect(after.categories).not.toContain('device');
  await expect(page.locator('#verify')).toContainText('Clean copy saved');
  expect(w.foreign()).toEqual([]);
  expect(w.problems, w.problems.join('\n')).toEqual([]);
});

test('respects unticked categories', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'full.jpg');
  await page.locator('.card[data-cat=device] input[type=checkbox]').uncheck();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  const after = await inspect(new Uint8Array(readFileSync((await dl.path())!)));
  expect(after.categories).toContain('device');
  expect(after.categories).not.toContain('location');
  expect(after.summary.device).toBe('Google Pixel 7a');
});

test('shows the hidden motion-photo video and removes it', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'motion.jpg');
  await expect(page.locator('#verdict')).toContainText('video');
  await expect(page.locator('.card[data-cat=hidden] video')).toHaveCount(1);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  const after = await inspect(new Uint8Array(readFileSync((await dl.path())!)));
  expect(after.hidden).toHaveLength(0);
});

test('shows an AI prompt hidden in a PNG', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'ai.png');
  await expect(page.locator('.card[data-cat=ai] pre')).toContainText('14 Elm Street');
});

test('handles HEIC metadata even where the browser cannot display it', async ({ page }) => {
  const w = watch(page);
  await page.goto('/');
  await upload(page, 'full.heic');
  await expect(page.locator('#verdict')).toContainText('Bengaluru');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  expect(dl.suggestedFilename()).toBe('photo-clean.heic');
  const after = await inspect(new Uint8Array(readFileSync((await dl.path())!)));
  expect(after.categories).not.toContain('location');
  expect(w.foreign()).toEqual([]);
});

test('sample photo: finds faces on-device, hides them, keeps no metadata @mobile', async ({ page }) => {
  const w = watch(page);
  await page.goto('/');
  await page.click('#sample');
  await expect(page.locator('#verdict')).toContainText('Pyotr Dubrov');
  await expect(page.locator('#verdict')).toContainText('United States');
  const webgl = await page.evaluate(() => !!(document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl')));
  await page.click('#scan');
  if (webgl) {
    await expect(page.locator('#face-hint')).toContainText(/Found \d+ face/, { timeout: 60_000 });
    expect(await page.locator('#overlay rect.box.face').count()).toBeGreaterThanOrEqual(4);
    // The object detector reports the people it sees.
    await expect(page.locator('.card[data-cat=objects]')).toContainText(/\d+ (people|person)/);
  } else {
    // No WebGL (e.g. headless Firefox): explain it and fall back to drawing a box by hand.
    await expect(page.locator('#face-hint')).toContainText('needs WebGL');
    await expect(page.locator('#scan')).toBeDisabled();
    await page.click('#draw');
    const box = (await page.locator('#overlay').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.1);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 5 });
    await page.mouse.up();
    await page.click('#draw');
    expect(await page.locator('#overlay rect.box').count()).toBe(1);
  }
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  const got = new Uint8Array(readFileSync((await dl.path())!));
  const after = await inspect(got);
  expect(after.format).toBe('jpeg');
  expect(after.categories).not.toContain('location');
  expect(after.categories).not.toContain('people');
  expect(after.categories).not.toContain('thumbnail');
  expect(after.width ?? 1100).toBe(1100);
  await expect(page.locator('#verify')).toContainText('re-encoded');
  expect(w.foreign()).toEqual([]);
  expect(w.problems, w.problems.join('\n')).toEqual([]);
});

test('keeps working offline once loaded', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForResponse((r) => r.url().endsWith('/geo/cities.tsv'), { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(() => fetch('/geo/cities.tsv').then((r) => r.text()));
  await context.setOffline(true);
  await upload(page, 'full.jpg');
  await expect(page.locator('#verdict')).toContainText('Bengaluru');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  expect(dl.suggestedFilename()).toBe('photo-clean.jpg');
  await context.setOffline(false);
});

test('serves the security headers it advertises', async ({ request }) => {
  const res = await request.get('/');
  const csp = res.headers()['content-security-policy'];
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("default-src 'none'");
  expect(res.headers()['referrer-policy']).toBe('no-referrer');
  // The file picker's "Take Photo" (iOS) runs under the page's camera permission: camera=() makes it black.
  expect(res.headers()['permissions-policy']).toContain('camera=(self)');
});

test('file name and properties: reveals what the name gives away and downloads a neutral name', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#file', { name: 'PXL_20241016_103122123.MP.jpg', mimeType: 'image/jpeg', buffer: readFileSync(join(FIX, 'full.jpg')) });
  await expect(page.locator('#verdict')).toContainText('Google Pixel camera');
  await expect(page.locator('.card[data-cat=file]')).toContainText('Motion photo marker');
  let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  expect(dl.suggestedFilename()).toBe('photo-clean.jpg');
  await page.locator('#neutral-name').uncheck();
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  expect(dl.suggestedFilename()).toBe('PXL_20241016_103122123.MP-clean.jpg');
});

test('says plainly when there is no GPS, and explains reverse image search without contacting anyone', async ({ page }) => {
  const w = watch(page);
  await page.goto('/');
  await upload(page, 'ai.png');
  await expect(page.locator('#verdict li.ok')).toContainText('no GPS position in the file');
  const web = page.locator('.card[data-cat=web]');
  await expect(web).toContainText('What a web search could find');
  const links = web.locator('a');
  expect(await links.count()).toBe(4);
  for (const a of await links.all()) {
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', /noopener/);
  }
  expect(w.foreign()).toEqual([]);
});

test('camera without GPS: no false location, preview copies labelled and shown upright', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'mpf.jpg');
  const verdict = page.locator('#verdict');
  await expect(verdict).toContainText('no GPS position in the file');
  await expect(verdict).not.toContainText('place names');
  await expect(verdict).toContainText('large preview copy of the picture (Full HD)');
  await expect(page.locator('.card[data-cat=location]')).toHaveCount(0);
  const img = page.locator('.card[data-cat=hidden] img');
  await expect(img).toHaveCount(1);
  // The 64x48 preview carries the main photo's orientation 6, so it displays as 48 wide, 64 tall.
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => (el.complete ? `${el.naturalWidth}x${el.naturalHeight}` : ''))).toBe('48x64');
});

/** Draw a box from (x1,y1) to (x2,y2), given as fractions of the preview. */
async function drawBox(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.click('#draw');
  const b = (await page.locator('#overlay').boundingBox())!;
  await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * x2, b.y + b.height * y2, { steps: 5 });
  await page.mouse.up();
  await page.click('#draw');
}

async function cleanSample(page: Page, query: string): Promise<Buffer> {
  await page.goto('/' + query);
  await page.click('#sample');
  await expect(page.locator('#verdict')).toContainText('League City');
  await drawBox(page, 0.3, 0.1, 0.6, 0.5);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  await expect(page.locator('#verify')).toContainText('Clean copy saved');
  return readFileSync((await dl.path())!);
}

test('very large photos are processed in strips at full resolution (iPhone canvas limit)', async ({ page }) => {
  // max-canvas=300000 forces ~272-row strips on the 1100x1252 sample; the box spans several strips.
  const tiled = await cleanSample(page, '?max-canvas=300000');
  await expect(page.locator('#verify')).toContainText('in strips');
  const normal = await cleanSample(page, '');
  await expect(page.locator('#verify')).not.toContainText('in strips');
  const original = readFileSync(join(import.meta.dirname, '..', 'site', 'public', 'sample', 'crew.jpg'));
  const stats = await page.evaluate(
    async ([a64, b64, o64]) => {
      const load = async (s: string) => {
        const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(s), (c) => c.charCodeAt(0))]));
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0);
        return { w: bmp.width, h: bmp.height, d: ctx.getImageData(0, 0, bmp.width, bmp.height).data };
      };
      const [a, b, o] = await Promise.all([load(a64), load(b64), load(o64)]);
      const mad = (p: typeof a, q: typeof a, x0: number, y0: number, x1: number, y1: number) => {
        let s = 0;
        let n = 0;
        for (let y = Math.floor(y0 * p.h); y < Math.floor(y1 * p.h); y++)
          for (let x = Math.floor(x0 * p.w); x < Math.floor(x1 * p.w); x++) {
            const i = (y * p.w + x) * 4;
            s += Math.abs(p.d[i] - q.d[i]) + Math.abs(p.d[i + 1] - q.d[i + 1]) + Math.abs(p.d[i + 2] - q.d[i + 2]);
            n += 3;
          }
        return s / n;
      };
      return {
        dims: [a.w, a.h, b.w, b.h],
        tiledVsNormal: mad(a, b, 0, 0, 1, 1),
        insideBox: mad(a, o, 0.34, 0.15, 0.56, 0.45),
        outsideBox: mad(a, o, 0, 0.6, 1, 1),
      };
    },
    [tiled.toString('base64'), normal.toString('base64'), original.toString('base64')],
  );
  expect(stats.dims).toEqual([1100, 1252, 1100, 1252]);
  expect(stats.tiledVsNormal).toBeLessThan(4); // same picture, two JPEG encoders
  expect(stats.insideBox).toBeGreaterThan(8); // the box really is hidden
  expect(stats.outsideBox).toBeLessThan(4); // the rest is untouched apart from re-encoding
  const after = await inspect(new Uint8Array(tiled));
  expect(after.categories).not.toContain('location');
  expect(after.width ?? 1100).toBe(1100);
});
