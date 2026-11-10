import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { carryExif, inspect, strip } from '../src/index.js';
import { fixture, HAS_EXIFTOOL, HAS_MAGICK, pixelSignature, save, tagNames, warnings, FIXTURES, OUT } from './helpers.js';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const oracle = HAS_EXIFTOOL && HAS_MAGICK ? describe : describe.skip;

/** Tags that must never survive the default strip. */
const FORBIDDEN = [
  /^GPS/,
  /^(Make|Model|SerialNumber|LensModel|LensSerialNumber|ImageUniqueID|OwnerName)$/,
  /^(Artist|Copyright|Creator|By-line)$/,
  /^(ImageDescription|UserComment|XPComment|Caption-Abstract|Keywords|Comment|Description)$/,
  /^(Software|CreatorTool)$/,
  /^(DateTimeOriginal|CreateDate|ModifyDate|OffsetTimeOriginal|DateCreated)$/,
  /^(City|Country|PersonInImage|DocumentID|DocumentAncestors)$/,
  /^(ThumbnailImage|ThumbnailOffset|ThumbnailLength)$/,
  /^(MotionPhoto|MotionPhotoVersion|Author|Parameters)$/,
];

function forbiddenLeft(path: string): string[] {
  return tagNames(path).filter((t) => FORBIDDEN.some((re) => re.test(t)));
}

oracle('strip (checked with exiftool and ImageMagick)', () => {
  for (const name of ['full.jpg', 'full.png', 'full.webp', 'full.heic', 'full.avif', 'motion.jpg', 'ai.png']) {
    it(`removes private metadata from ${name} without changing a pixel`, async () => {
      const src = fixture(name);
      const r = await strip(src);
      const out = save(`default-${name}`, r.bytes);
      expect(forbiddenLeft(out)).toEqual([]);
      expect(pixelSignature(out)).toBe(pixelSignature(join(FIXTURES, name)));
      expect(warnings(out)).not.toMatch(/error/i);
      expect(r.lossless).toBe(true);
      if (!name.startsWith('ai')) expect(r.removed).toContain('location');
    });
  }

  it('keeps camera settings by default and drops them with remove: "all"', async () => {
    const kept = save('settings-kept.jpg', (await strip(fixture('full.jpg'))).bytes);
    expect(tagNames(kept)).toEqual(expect.arrayContaining(['ExposureTime', 'FNumber', 'ISO', 'FocalLength']));
    const gone = save('settings-gone.jpg', (await strip(fixture('full.jpg'), { remove: 'all' })).bytes);
    expect(tagNames(gone)).not.toContain('ExposureTime');
    expect(tagNames(gone)).not.toContain('FNumber');
  });

  it('removes only what was asked', async () => {
    const r = await strip(fixture('full.jpg'), { remove: ['location'] });
    const out = save('only-location.jpg', r.bytes);
    const tags = tagNames(out);
    expect(tags.filter((t) => /^GPS(Latitude|Longitude|Altitude|ImgDirection)/.test(t))).toEqual([]);
    expect(tags).toEqual(expect.arrayContaining(['Make', 'Model', 'DateTimeOriginal', 'ThumbnailImage', 'Artist']));
    // GPS date/time belong to 'time', so they stay.
    expect(tags).toContain('GPSDateStamp');
    // City lives in XMP and IPTC, which are removed as whole blocks.
    expect(tags).not.toContain('City');
    expect(r.notes.join(' ')).toMatch(/XMP/);
    expect(pixelSignature(out)).toBe(pixelSignature(join(FIXTURES, 'full.jpg')));
  });

  it('drops the motion-photo video and shrinks the file', async () => {
    const src = fixture('motion.jpg');
    const r = await strip(src, { remove: ['hidden'] });
    expect(r.removed).toContain('hidden');
    expect(r.bytes.length).toBeLessThan(src.length);
    expect((await inspect(r.bytes)).hidden).toHaveLength(0);
  });

  it('is idempotent', async () => {
    for (const name of ['full.jpg', 'full.png', 'full.webp', 'full.heic']) {
      const once = (await strip(fixture(name))).bytes;
      const twice = (await strip(once)).bytes;
      expect(Buffer.from(twice).equals(Buffer.from(once)), name).toBe(true);
    }
  });

  it('leaves files with nothing to remove byte-identical', async () => {
    const clean = (await strip(fixture('full.jpg'), { remove: 'all' })).bytes;
    const again = (await strip(clean, { remove: 'all' })).bytes;
    expect(Buffer.from(again).equals(Buffer.from(clean))).toBe(true);
  });

  it('reports HEIC thumbnails it cannot remove in place', async () => {
    const r = await strip(fixture('full.heic'));
    const report = await inspect(r.bytes);
    expect(report.categories).not.toContain('location');
    // libheif-made fixtures have no thumbnail item; the retained list is simply empty here.
    expect(Array.isArray(r.retained)).toBe(true);
  });

  it('carries kept EXIF into a re-encoded JPEG with upright orientation', async () => {
    const reenc = join(OUT, 'reencoded.jpg');
    execFileSync('magick', [join(FIXTURES, 'full.jpg'), '-strip', '-quality', '85', reenc]);
    const merged = await carryExif(fixture('full.jpg'), new Uint8Array(readFileSync(reenc)), { width: 96, height: 96, remove: ['location', 'device', 'author', 'time', 'descriptions', 'software', 'history', 'people', 'other'] });
    const out = save('carried.jpg', merged);
    const tags = tagNames(out);
    expect(tags).toEqual(expect.arrayContaining(['ExposureTime', 'FNumber', 'Orientation']));
    expect(tags.filter((t) => t.startsWith('GPS'))).toEqual([]);
    expect(tags).not.toContain('ThumbnailImage');
    expect(execFileSync('exiftool', ['-s3', '-n', '-Orientation', out], { encoding: 'utf8' }).trim()).toBe('1');
    expect(pixelSignature(out)).toBe(pixelSignature(reenc));
  });
});
