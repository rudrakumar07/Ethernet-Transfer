import type { StatsPoint } from '../../../shared/types';

/** Fixed-capacity time-series buffer; pure, no I/O. */
export class RingBuffer {
  private points: StatsPoint[] = [];

  constructor(private readonly maxAgeMs: number) {}

  push(t: number, value: number): void {
    this.points.push({ t, value });
    const cutoff = t - this.maxAgeMs;
    while (this.points.length && this.points[0].t < cutoff) {
      this.points.shift();
    }
  }

  range(sinceMs: number, now: number): StatsPoint[] {
    const cutoff = now - sinceMs;
    return this.points.filter((p) => p.t >= cutoff);
  }

  all(): StatsPoint[] {
    return [...this.points];
  }

  loadAll(points: StatsPoint[]): void {
    this.points = [...points];
  }
}
