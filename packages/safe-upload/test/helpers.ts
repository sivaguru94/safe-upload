import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures');
export const OUT = join(FIXTURES, 'out');
mkdirSync(OUT, { recursive: true });

export const fixture = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

const has = (cmd: string) => {
  try {
    execFileSync(cmd, ['-ver'], { stdio: 'ignore' });
    return true;
  } catch {
    try {
      execFileSync(cmd, ['-version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
};
export const HAS_EXIFTOOL = has('exiftool');
export const HAS_MAGICK = has('magick');

export function save(name: string, bytes: Uint8Array): string {
  const p = join(OUT, name);
  writeFileSync(p, bytes);
  return p;
}

/** All tags exiftool can find, keyed "Group:Tag". */
export function exif(path: string): Record<string, unknown> {
  const out = execFileSync('exiftool', ['-j', '-a', '-G1', '-u', path], { encoding: 'utf8' });
  return JSON.parse(out)[0];
}

/** Tag names (without group) present in a file, excluding exiftool's file-system/composite info. */
export function tagNames(path: string): string[] {
  return Object.keys(exif(path))
    .filter((k) => !/^(System|File|ExifTool|Composite|SourceFile)\b/.test(k) || k === 'File:Comment')
    .map((k) => k.split(':').pop()!);
}

/** ImageMagick pixel signature: equal only if decoded pixels are identical. */
export function pixelSignature(path: string): string {
  return execFileSync('magick', ['identify', '-format', '%#', path], { encoding: 'utf8' }).trim();
}

export function warnings(path: string): string {
  return execFileSync('exiftool', ['-s3', '-Warning', '-Error', path], { encoding: 'utf8' }).trim();
}
