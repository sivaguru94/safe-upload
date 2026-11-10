import { utf8 } from './bytes.js';
import { sortCategories } from './categories.js';
import { analyzeTiff, parseTiff, type Tiff } from './exif.js';
import { analyzeIrb } from './iptc.js';
import type { Category, Finding, Format, HiddenMedia, Report, Source } from './types.js';
import { analyzeXmp, xmpFindings } from './xmp.js';

/** Accumulates findings from every metadata block of one file into a Report. */
export class Collector {
  findings: Finding[] = [];
  report: Report;

  constructor(format: Format, mime: string, size: number) {
    this.report = {
      format,
      mime,
      size,
      findings: this.findings,
      categories: [],
      summary: { serialNumbers: [], people: [], names: [], software: [] },
      thumbnails: [],
      hidden: [],
      notes: [],
    };
  }

  add(f: Finding): void {
    this.findings.push(f);
  }

  note(s: string): void {
    if (!this.report.notes.includes(s)) this.report.notes.push(s);
  }

  hidden(h: HiddenMedia): void {
    this.report.hidden.push(h);
  }

  tiff(bytes: Uint8Array, source: Source, removable = true): Tiff | null {
    const tiff = parseTiff(bytes);
    if (!tiff) {
      this.add({ category: 'other', source, key: 'exif.unreadable', label: 'Unreadable EXIF block', value: `${bytes.length} bytes`, removable });
      return null;
    }
    const a = analyzeTiff(tiff, source, removable);
    this.findings.push(...a.findings);
    const s = this.report.summary;
    if (a.gps && !s.gps) s.gps = a.gps;
    if (a.capturedAt && !s.capturedAt) s.capturedAt = a.capturedAt;
    if (a.timeZone && !s.timeZone) s.timeZone = a.timeZone;
    if (a.device && !s.device) s.device = a.device;
    s.serialNumbers.push(...a.serialNumbers);
    s.names.push(...a.names);
    s.software.push(...a.software);
    if (a.orientation && !this.report.orientation) this.report.orientation = a.orientation;
    if (a.thumbnail) this.report.thumbnails.push(a.thumbnail);
    if (!this.report.width && a.width && a.height) {
      this.report.width = a.width;
      this.report.height = a.height;
    }
    for (const w of tiff.warnings.slice(0, 3)) this.note(`EXIF: ${w}`);
    return tiff;
  }

  xmp(bytes: Uint8Array | string, source: Source, removable = true): Set<Category> {
    const text = typeof bytes === 'string' ? bytes : utf8(bytes);
    const a = analyzeXmp(text);
    this.findings.push(...xmpFindings(a, source, removable));
    const s = this.report.summary;
    if (a.gps && !s.gps) s.gps = a.gps;
    s.names.push(...a.names);
    s.people.push(...a.people);
    s.software.push(...a.software);
    if (a.motionPhoto) this.note('The XMP block declares this is a motion photo with an embedded video.');
    if (a.aiPrompt && !s.aiPrompt) s.aiPrompt = a.aiPrompt;
    return a.categories;
  }

  irb(bytes: Uint8Array, source: Source, removable = true): Set<Category> {
    const a = analyzeIrb(bytes, source, removable);
    this.findings.push(...a.findings);
    this.report.summary.names.push(...a.names);
    if (a.thumbnail) this.report.thumbnails.push(a.thumbnail);
    const cats = new Set(a.categories);
    if (a.xmp) for (const c of this.xmp(a.xmp, source, removable)) cats.add(c);
    return cats;
  }

  finish(): Report {
    const s = this.report.summary;
    s.serialNumbers = unique(s.serialNumbers);
    s.people = unique(s.people);
    s.names = unique(s.names).filter((n) => !s.people.includes(n));
    s.software = unique(s.software);
    this.report.categories = sortCategories(this.findings.map((f) => f.category));
    return this.report;
  }
}

function unique(a: string[]): string[] {
  return [...new Set(a.map((x) => x.trim()).filter(Boolean))];
}

export function categoriesOf(findings: Finding[]): Set<Category> {
  return new Set(findings.map((f) => f.category));
}
