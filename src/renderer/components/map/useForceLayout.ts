import { useEffect, useMemo, useRef, useState } from 'react';
import { forceSimulation, forceRadial, forceCollide, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import type { Device } from '../../../shared/types';
import { mapGeometry } from './layout';

export interface MapNode extends SimulationNodeDatum {
  id: string;
  device: Device;
}

/** Only place importing d3-force (spec §12.5). Positions devices on rings by link type. */
export function useForceLayout(devices: Device[], width: number, height: number) {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const nodesRef = useRef<Map<string, MapNode>>(new Map());
  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  // devices is a fresh array on every beacon (roughly twice a second per peer),
  // and re-running the simulation each time made the whole map jitter. Only the
  // membership and ring assignment actually change the layout.
  const layoutKey = useMemo(
    () => devices.map((d) => `${d.id}:${d.linkType}`).sort().join('|'),
    [devices],
  );

  useEffect(() => {
    if (width <= 0 || height <= 0) return;
    const geometry = mapGeometry(width, height);
    const { cx, cy } = geometry;
    const existing = nodesRef.current;
    const next: MapNode[] = devicesRef.current.map((device) => {
      const prior = existing.get(device.id);
      return prior ? { ...prior, device } : { id: device.id, device, x: cx + Math.random() * 10, y: cy + Math.random() * 10 };
    });
    nodesRef.current = new Map(next.map((n) => [n.id, n]));

    const sim = forceSimulation(next)
      .force('radial', forceRadial((d: MapNode) => geometry.radii[d.device.linkType], cx, cy).strength(0.9))
      .force('x', forceX(cx).strength(0.02))
      .force('y', forceY(cy).strength(0.02))
      .force('collide', forceCollide(geometry.nodeRadius * 2.6))
      .stop();

    for (let i = 0; i < 120; i++) sim.tick();
    setNodes([...next]);
  }, [layoutKey, width, height]);

  return nodes;
}
