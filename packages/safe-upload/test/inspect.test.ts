import { describe, expect, it } from 'vitest';
import { inspect } from '../src/index.js';
import { fixture } from './helpers.js';

const STANDARD = ['location', 'time', 'device', 'author', 'descriptions', 'software', 'settings', 'people', 'history'] as const;

describe('inspect', () => {
  for (const [name, format] of [
    ['full.jpg', 'jpeg'],
    ['full.png', 'png'],
    ['full.webp', 'webp'],
    ['full.heic', 'heic'],
    ['full.avif', 'avif'],
  ] as const) {
    it(`finds every category in ${name}`, async () => {
      const r = await inspect(fixture(name));
      expect(r.format).toBe(format);
      for (const c of STANDARD) expect(r.categories, `missing ${c}`).toContain(c);
      expect(r.summary.gps!.latitude).toBeCloseTo(12.971599, 4);
      expect(r.summary.gps!.longitude).toBeCloseTo(77.594566, 4);
      expect(r.summary.gps!.direction).toBeCloseTo(132, 0);
      expect(r.summary.device).toBe('Google Pixel 7a');
      expect(r.summary.serialNumbers).toContain('SN-7A-123456');
      expect(r.summary.names).toContain('Jane Doe');
      expect(r.summary.people).toContain('John Smith');
      expect(r.summary.capturedAt).toBe('2024:09:14 18:42:10');
      expect(r.summary.timeZone).toBe('+05:30');
      expect(r.width).toBe(96);
      expect(r.height).toBe(96);
    });
  }

  it('reports the embedded thumbnail, IPTC and comment in a JPEG', async () => {
    const r = await inspect(fixture('full.jpg'));
    expect(r.categories).toContain('thumbnail');
    expect(r.thumbnails[0][0]).toBe(0xff);
    expect(r.thumbnails[0][1]).toBe(0xd8);
    expect(r.findings.some((f) => f.source === 'iptc' && f.value === 'Bengaluru')).toBe(true);
    expect(r.findings.some((f) => f.key === 'jpeg.Comment' && f.value.includes('spare key'))).toBe(true);
    expect(r.findings.some((f) => f.value.includes('door code 4821'))).toBe(true);
  });

  it('finds the hidden video in a motion photo', async () => {
    const r = await inspect(fixture('motion.jpg'));
    expect(r.categories).toContain('hidden');
    expect(r.hidden).toHaveLength(1);
    expect(r.hidden[0].kind).toBe('video');
    expect(r.hidden[0].mime).toBe('video/mp4');
  });

  it('finds an AI generation prompt in a PNG', async () => {
    const r = await inspect(fixture('ai.png'));
    expect(r.categories).toContain('ai');
    expect(r.summary.aiPrompt).toContain('14 Elm Street');
  });

  it('does not call an empty GPS block (version only, as Nikon writes it) a location', async () => {
    const r = await inspect(fixture('nogps.jpg'));
    expect(r.categories).not.toContain('location');
    expect(r.summary.gps).toBeUndefined();
    expect(r.findings.some((f) => f.key === 'exif.GPSVersionID')).toBe(false);
    expect(r.summary.device).toBe('NIKON CORPORATION NIKON D5600');
  });

  it('labels extra images from the MPF index', async () => {
    const r = await inspect(fixture('mpf.jpg'));
    expect(r.hidden).toHaveLength(1);
    expect(r.hidden[0].label).toBe('Large preview copy of the picture (Full HD)');
    expect(r.hidden[0].bytes[0]).toBe(0xff);
    expect(r.findings.find((f) => f.key === 'jpeg.MPF')?.value).toContain('1 extra picture');
  });

  it('rejects files that are not images', async () => {
    await expect(inspect(new TextEncoder().encode('hello world, not an image'))).rejects.toThrow(/Unsupported/);
  });

  it('accepts Blob input', async () => {
    const r = await inspect(new Blob([fixture('full.jpg')]));
    expect(r.format).toBe('jpeg');
  });
});
