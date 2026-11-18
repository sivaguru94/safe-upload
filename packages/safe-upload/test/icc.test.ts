import { describe, expect, it } from 'vitest';
import { inspect, strip } from '../src/index.js';
import { iccDate } from '../src/icc.js';
import { fixture } from './helpers.js';

// A 128-byte ICC header is enough for the date logic; real profiles carry tags after it.
function iccHeader(date: number[]): Uint8Array {
  const p = new Uint8Array(132);
  new DataView(p.buffer).setUint32(0, p.length);
  date.forEach((v, i) => new DataView(p.buffer).setUint16(24 + i * 2, v));
  p.set([0x61, 0x63, 0x73, 0x70], 36); // 'acsp'
  p.fill(0xab, 84, 100); // profile ID
  return p;
}

/** full.jpg with an APP2 ICC_PROFILE segment inserted right after SOI. */
function jpegWithIcc(date: number[]): Uint8Array {
  const jpg = fixture('nogps.jpg');
  const icc = iccHeader(date);
  const payload = new Uint8Array([...new TextEncoder().encode('ICC_PROFILE\0'), 1, 1, ...icc]);
  const seg = new Uint8Array(4 + payload.length);
  seg.set([0xff, 0xe2, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  seg.set(payload, 4);
  return new Uint8Array([...jpg.subarray(0, 2), ...seg, ...jpg.subarray(2)]);
}

describe('ICC profile date', () => {
  it('reports and blanks a per-photo profile date (Apple adaptive gain curve)', async () => {
    const file = jpegWithIcc([2026, 10, 19, 18, 20, 22]);
    const finding = (await inspect(file)).findings.find((f) => f.key === 'jpeg.ICC.date');
    expect(finding?.value).toBe('2026:10:19 18:20:22');
    expect(finding?.category).toBe('time');

    const r = await strip(file, { remove: ['time'] });
    expect(r.removed).toContain('time');
    expect(r.bytes.length).toBe(file.length);
    const icc = r.bytes.subarray(2 + 4 + 14); // segment stays first: SOI, marker+length, ICC_PROFILE id+seq+count
    expect(iccDate(icc)).toBeUndefined();
    expect([...icc.subarray(84, 100)].every((x) => x === 0)).toBe(true);
    expect((await inspect(r.bytes)).findings.some((f) => f.source === 'icc')).toBe(false);
  });

  it('leaves stock profiles alone (fixed or midnight dates)', async () => {
    for (const d of [[2022, 1, 1, 0, 0, 0], [1998, 2, 9, 6, 49, 0]]) {
      const file = jpegWithIcc(d);
      expect((await inspect(file)).findings.some((f) => f.source === 'icc')).toBe(false);
      expect((await strip(file, { remove: ['time'] })).bytes).toEqual(file);
    }
  });
});
