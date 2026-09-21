import { describe, it, expect } from 'vitest';
import { mapGeometry } from '../../src/renderer/components/map/layout';

/**
 * The network map used a fixed 480x320 viewBox stretched to fill its container.
 * At a normal 1200px window that meant every node, label and ring was drawn at
 * 1.76x and the outer rings were letterboxed off the edges - the centrepiece of
 * the app looked broken. Geometry is now derived from the real pixel size.
 */
describe('mapGeometry', () => {
  it('centres on the container', () => {
    const g = mapGeometry(800, 600);
    expect(g.cx).toBe(400);
    expect(g.cy).toBe(300);
  });

  it('orders the rings by closeness of the link', () => {
    const g = mapGeometry(800, 600);
    expect(g.radii.direct).toBeLessThan(g.radii.wired);
    expect(g.radii.wired).toBeLessThan(g.radii.wireless);
  });

  it('keeps the outermost ring and its nodes inside the container', () => {
    for (const [w, h] of [[800, 600], [1400, 900], [420, 380], [900, 320]]) {
      const g = mapGeometry(w, h);
      const halfMin = Math.min(w, h) / 2;
      expect(g.radii.wireless + g.nodeRadius).toBeLessThanOrEqual(halfMin);
    }
  });

  it('grows with the container instead of scaling a fixed drawing', () => {
    const small = mapGeometry(500, 400);
    const large = mapGeometry(1200, 800);
    expect(large.radii.wireless).toBeGreaterThan(small.radii.wireless);
  });

  it('keeps node size readable rather than proportional', () => {
    const small = mapGeometry(400, 300);
    const huge = mapGeometry(2400, 1600);
    // A node should not balloon on a big monitor, nor vanish on a small window.
    expect(huge.nodeRadius).toBeLessThanOrEqual(26);
    expect(small.nodeRadius).toBeGreaterThanOrEqual(12);
  });

  it('returns finite, non-negative values for degenerate sizes', () => {
    for (const [w, h] of [[0, 0], [-10, 50], [Number.NaN, 100], [10, 10]]) {
      const g = mapGeometry(w, h);
      for (const value of [g.cx, g.cy, g.nodeRadius, g.hubRadius, g.radii.direct, g.radii.wired, g.radii.wireless]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
