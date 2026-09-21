import type { LinkType } from '../../../shared/types';

export interface MapGeometry {
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** Ring radius per link type, in real pixels. */
  radii: Record<LinkType, number>;
  nodeRadius: number;
  hubRadius: number;
  /** Distance from a node's centre to its name label. */
  labelOffset: number;
}

/** Fractions of the usable radius each ring sits at. */
const RING_FRACTION: Record<LinkType, number> = { direct: 0.42, wired: 0.71, wireless: 1 };

const MIN_NODE_RADIUS = 12;
const MAX_NODE_RADIUS = 26;
/** Room reserved outside the outermost ring for a node and its label. */
const EDGE_PADDING = 26;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Derives the map's geometry from the container's real pixel size, so the SVG
 * can be drawn 1 unit = 1 pixel. Previously a fixed 480x320 viewBox was
 * stretched to fit, which scaled every node and label with it and pushed the
 * outer rings past the edges.
 */
export function mapGeometry(width: number, height: number): MapGeometry {
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  const halfMin = Math.min(w, h) / 2;

  // Node size tracks the container only loosely: it should stay legible on a
  // small window without ballooning on a large monitor.
  const nodeRadius = halfMin > 0 ? clamp(halfMin * 0.06, MIN_NODE_RADIUS, MAX_NODE_RADIUS) : 0;
  const usable = Math.max(0, halfMin - nodeRadius - EDGE_PADDING);

  return {
    width: w,
    height: h,
    cx: w / 2,
    cy: h / 2,
    radii: {
      direct: usable * RING_FRACTION.direct,
      wired: usable * RING_FRACTION.wired,
      wireless: usable * RING_FRACTION.wireless,
    },
    nodeRadius,
    hubRadius: nodeRadius > 0 ? clamp(nodeRadius * 1.35, 0, 34) : 0,
    labelOffset: nodeRadius + 12,
  };
}
