import { useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    const cx = width / 2;
    const cy = height / 2;
    const existing = nodesRef.current;
    const next: MapNode[] = devices.map((device) => {
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
  }, [devices, width, height]);

  return nodes;
}
