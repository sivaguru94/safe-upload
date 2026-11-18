import { startsWith, u16be } from './bytes.js';

// ICC header: creation date at 24..35 (six u16be), 'acsp' at 36, profile ID (MD5) at 84..99.
const DATE = 24;
const ID = 84;

/** Creation date stored in an ICC profile header, as "YYYY:MM:DD hh:mm:ss". */
export function iccDate(p: Uint8Array): string | undefined {
  if (p.length < 128 || !startsWith(p, 36, 'acsp')) return undefined;
  const v = [0, 1, 2, 3, 4, 5].map((i) => u16be(p, DATE + i * 2));
  if (!v[0]) return undefined;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${v[0]}:${two(v[1])}:${two(v[2])} ${two(v[3])}:${two(v[4])}:${two(v[5])}`;
}

/**
 * True when the profile was generated for this picture rather than shipped with the OS.
 * Stock profiles (Display P3, sRGB) carry a fixed old date or a midnight date; Apple's
 * per-photo HDR/adaptive gain curve profiles carry the processing time, minutes after capture.
 */
export function iccDateReveals(date: string | undefined): boolean {
  if (!date) return false;
  return Number(date.slice(0, 4)) >= 2015 && !date.endsWith(' 00:00:00');
}

/** Copy of the profile with the creation date (and the MD5 profile ID that may cover it) zeroed. */
export function blankIccDate(p: Uint8Array): Uint8Array {
  const out = p.slice();
  out.fill(0, DATE, DATE + 12);
  out.fill(0, ID, ID + 16);
  return out;
}
