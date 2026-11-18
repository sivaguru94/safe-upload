// Run real photos through inspect() + strip() and cross-check with exiftool and ImageMagick.
// Usage: node scripts/corpus-check.mjs <dir-with-photos> [out-dir]
// Writes cleaned copies + REPORT.md to out-dir (default <dir>/_check). Exit code 1 if any file FAILs.
// FAIL  = something revealing survived strip, pixels changed, or the clean file is damaged.
// LOOK  = exiftool sees metadata groups that inspect() did not report (possible gap; turn into a fixture).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { inspect, strip } from '../packages/safe-upload/dist/index.js';

const [dir, outArg] = process.argv.slice(2);
if (!dir) throw new Error('usage: node scripts/corpus-check.mjs <dir> [out-dir]');
const out = outArg ?? join(dir, '_check');
mkdirSync(out, { recursive: true });

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const exif = (p) => JSON.parse(run('exiftool', ['-j', '-a', '-G1', '-u', '-b', '-api', 'LargeFileSupport=1', p]))[0];
const pixels = (p) => { try { return run('magick', ['identify', '-format', '%#\n', p]).split('\n')[0]; } catch { return null; } };
const IGNORE_GROUP = /^(System|File|ExifTool|Composite|SourceFile|ICC|ICC-header|ICC_Profile|ICC-view|ICC-meas|JFIF|RIFF)$/;
// Container/codec structure exiftool reports for HEIF/AVIF; describes the picture, reveals nothing.
const STRUCTURAL = /^(MajorBrand|MinorVersion|CompatibleBrands|HandlerType|PrimaryItemReference|MediaData(Size|Offset)|ImageSpatialExtent|ImagePixelDepth|AuxiliaryImageType|ColorProfiles|ColorPrimaries|TransferCharacteristics|MatrixCoefficients|VideoFullRangeFlag|Chroma\w*|BitDepth\w*|AV1\w*|HEVC\w*|General\w*|GenProfile\w*|ConstraintIndicatorFlags|Seq\w*|HighBitDepth|TwelveBit|InitialDelaySamples|MediaData|MinSpatialSegmentationIDC|ParallelismType|AverageFrameRate|ConstantFrameRate|NumTemporalLayers|TemporalIDNested|Rotation|ImageWidth|ImageHeight)$/;
// Tags that must never survive a default strip.
const LEAK = /^(GPS\w*|SerialNumber|BodySerialNumber|LensSerialNumber|InternalSerialNumber|OwnerName|CameraOwnerName|Artist|Creator|By-line|DateTimeOriginal|CreateDate|OffsetTimeOriginal|ThumbnailImage|PreviewImage|MotionPhoto\w*|MicroVideo\w*|EmbeddedVideo\w*|Trailer\w*|Make|Model|Software|UserComment|ImageUniqueID)$/;
// Source names inspect() uses, mapped to exiftool group-1 prefixes they cover.
const COVERS = { exif: /^(IFD0|IFD1|ExifIFD|GPS|InteropIFD|MakerNotes|Apple|Samsung|Google|Canon|Nikon|Sony|Olympus|Panasonic|FujiFilm|Pentax)/, xmp: /^XMP/, iptc: /^IPTC/, jpeg: /^(JFIF|APP\d+|JPEG|MPF\d*|MPImage\d*|Photoshop|Ducky|Adobe|Trailer|Google|Samsung)/, png: /^PNG/, webp: /^RIFF/, heif: /^(QuickTime|ItemList|Keys|HEIF|Meta|Track\d+)/, icc: /^ICC/ };

const rows = [];
let failed = 0;
for (const name of readdirSync(dir).sort()) {
  const src = join(dir, name);
  if (!statSync(src).isFile() || name.startsWith('.')) continue;
  const row = { name, verdict: 'OK', notes: [] };
  rows.push(row);
  try {
    const bytes = new Uint8Array(readFileSync(src));
    const report = await inspect(bytes);
    row.format = report.format;
    row.categories = report.categories.join(', ') || '-';
    row.hidden = (report.hidden ?? []).map((h) => h.label).join(', ');
    if (report.format === 'unknown') { row.verdict = 'SKIP'; row.notes.push('unsupported format'); continue; }

    const res = await strip(bytes);
    const clean = join(out, basename(name).replace(/(\.[^.]+)?$/, '-clean$1'));
    writeFileSync(clean, res.bytes);
    row.removed = res.removed.join(', ') || '-';
    if (res.retained.length) row.notes.push(`retained (format cannot drop): ${res.retained.map((f) => f.key).join(', ')}`);

    const before = exif(src);
    const after = exif(clean);
    const leaks = Object.keys(after).filter((k) => LEAK.test(k.split(':').pop()) && !k.startsWith('Composite:'));
    if (leaks.length) { row.verdict = 'FAIL'; row.notes.push(`survived strip: ${leaks.join(', ')}`); }
    for (const k of ['ExifTool:Warning', 'ExifTool:Error']) {
      if (after[k] && after[k] !== before[k]) { row.verdict = 'FAIL'; row.notes.push(`clean file ${k.split(':')[1]}: ${after[k]}`); }
    }
    const p0 = pixels(src), p1 = pixels(clean);
    if (p0 && p1 && p0 !== p1) { row.verdict = 'FAIL'; row.notes.push('pixels changed'); }
    if (!p0) row.notes.push('pixel check skipped (ImageMagick cannot decode)');

    const seenSources = new Set(report.findings.map((f) => f.source));
    const unexplained = Object.keys(before).filter((k) => {
      const [g, t] = k.split(':');
      return t && !IGNORE_GROUP.test(g) && !STRUCTURAL.test(t) && ![...seenSources].some((s) => COVERS[s]?.test(g));
    });
    if (unexplained.length) { if (row.verdict === 'OK') row.verdict = 'LOOK'; row.notes.push(`exiftool tags not reported by inspect: ${unexplained.slice(0, 12).join(', ')}${unexplained.length > 12 ? ' ...' : ''}`); }
  } catch (e) {
    row.verdict = 'FAIL';
    row.notes.push(`error: ${e.message}`);
  }
  if (row.verdict === 'FAIL') failed++;
}

const md = [
  `# Corpus check ${new Date().toISOString().slice(0, 16)}Z`, '',
  `${rows.length} files: ${['OK', 'LOOK', 'FAIL', 'SKIP'].map((v) => `${rows.filter((r) => r.verdict === v).length} ${v}`).join(', ')}`, '',
  '| File | Format | Verdict | Found | Removed | Hidden media | Notes |', '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.format ?? ''} | ${r.verdict} | ${r.categories ?? ''} | ${r.removed ?? ''} | ${r.hidden ?? ''} | ${r.notes.join('; ')} |`),
].join('\n');
writeFileSync(join(out, 'REPORT.md'), md + '\n');
console.log(md);
process.exitCode = failed ? 1 : 0;
