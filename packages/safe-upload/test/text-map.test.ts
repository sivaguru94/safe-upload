import { describe, expect, it } from 'vitest';
import { plateCandidates, textBoxesFromMap } from '../src/browser/text.js';

function map(w: number, h: number, blobs: { x: number; y: number; w: number; h: number; p: number }[]): Float32Array {
  const m = new Float32Array(w * h);
  for (const b of blobs) for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) m[y * w + x] = b.p;
  return m;
}

describe('textBoxesFromMap (DB post-processing)', () => {
  it('finds separate regions, grows them by the unclip distance and drops weak ones', () => {
    const m = map(100, 60, [
      { x: 10, y: 10, w: 40, h: 8, p: 0.9 }, // a word
      { x: 60, y: 40, w: 20, h: 6, p: 0.8 }, // another word
      { x: 5, y: 45, w: 10, h: 10, p: 0.35 }, // above threshold but low confidence: dropped
      { x: 90, y: 5, w: 2, h: 2, p: 0.95 }, // speck: dropped
    ]);
    const boxes = textBoxesFromMap(m, 100, 60);
    expect(boxes).toHaveLength(2);
    const [a, b] = boxes;
    // unclip d = 40*8*1.6 / (2*48) = 5.33
    expect(a.x).toBeCloseTo(10 - 5.333, 2);
    expect(a.width).toBeCloseTo(40 + 2 * 5.333, 2);
    expect(a.score).toBeCloseTo(0.9, 5);
    expect(b.y).toBeLessThan(40);
  });

  it('keeps boxes inside the map', () => {
    const [b] = textBoxesFromMap(map(50, 20, [{ x: 0, y: 0, w: 30, h: 10, p: 0.9 }]), 50, 20);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
  });
});

describe('plateCandidates', () => {
  it('marks wide text inside a vehicle, not text elsewhere or tall text', () => {
    const bike = { x: 100, y: 100, width: 300, height: 300 };
    const text = [
      { x: 180, y: 300, width: 120, height: 30 }, // plate on the bike
      { x: 500, y: 50, width: 120, height: 30 }, // shop sign
      { x: 200, y: 150, width: 20, height: 60 }, // tall, narrow
    ];
    expect([...plateCandidates(text, [bike])]).toEqual([0]);
  });
});
