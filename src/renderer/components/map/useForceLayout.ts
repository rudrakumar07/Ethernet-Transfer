import { useEffect, useMemo, useRef, useState } from 'react';
import { forceSimulation, forceRadial, forceCollide, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import type { Device, LinkType } from '../../../shared/types';

export interface MapNode extends SimulationNodeDatum {
  id: string;
  device: Device;
}

const RING_RADIUS: Record<LinkType, number> = { direct: 70, wired: 120, wireless: 170 };

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
    const cx = width / 2;
    const cy = height / 2;
    const existing = nodesRef.current;
    const next: MapNode[] = devicesRef.current.map((device) => {
      const prior = existing.get(device.id);
      return prior ? { ...prior, device } : { id: device.id, device, x: cx + Math.random() * 10, y: cy + Math.random() * 10 };
    });
    nodesRef.current = new Map(next.map((n) => [n.id, n]));

    const sim = forceSimulation(next)
      .force('radial', forceRadial((d: MapNode) => RING_RADIUS[d.device.linkType], cx, cy).strength(0.6))
      .force('x', forceX(cx).strength(0.02))
      .force('y', forceY(cy).strength(0.02))
      .force('collide', forceCollide(30))
      .stop();

    for (let i = 0; i < 120; i++) sim.tick();
    setNodes([...next]);
  }, [layoutKey, width, height]);

  return nodes;
}
