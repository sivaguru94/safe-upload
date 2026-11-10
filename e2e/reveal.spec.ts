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
  expect(dl.suggestedFilename()).toBe('full-clean.jpg');
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
  expect(dl.suggestedFilename()).toBe('full-clean.heic');
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
    expect(await page.locator('#overlay rect.box').count()).toBeGreaterThanOrEqual(4);
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
  expect(dl.suggestedFilename()).toBe('full-clean.jpg');
  await context.setOffline(false);
});

test('serves the security headers it advertises', async ({ request }) => {
  const res = await request.get('/');
  const csp = res.headers()['content-security-policy'];
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("default-src 'none'");
  expect(res.headers()['referrer-policy']).toBe('no-referrer');
});
