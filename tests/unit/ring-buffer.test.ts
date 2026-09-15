import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../../src/core/stats/logic/ring-buffer';

describe('RingBuffer', () => {
  it('returns only points within the requested window', () => {
    const buf = new RingBuffer(10_000);
    buf.push(1000, 1);
    buf.push(2000, 2);
    buf.push(9000, 3);
    // range(sinceMs=5000, now=10000) means "points from t>=5000" -> only t=9000.
    expect(buf.range(5000, 10000).map((p) => p.value)).toEqual([3]);
    // A window covering the full history reaches every point.
    expect(buf.range(9500, 10000).map((p) => p.value)).toEqual([1, 2, 3]);
  });

  it('evicts points older than maxAge on push', () => {
    const buf = new RingBuffer(5000);
    buf.push(0, 1);
    buf.push(6000, 2); // evicts the point at t=0 since 6000-5000=1000 > 0
    expect(buf.all().map((p) => p.value)).toEqual([2]);
  });

  it('loadAll replaces the buffer contents', () => {
    const buf = new RingBuffer(10_000);
    buf.push(0, 1);
    buf.loadAll([{ t: 100, value: 42 }]);
    expect(buf.all()).toEqual([{ t: 100, value: 42 }]);
  });
});
