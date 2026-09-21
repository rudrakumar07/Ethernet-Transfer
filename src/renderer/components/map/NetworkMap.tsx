import React, { useMemo, useState } from 'react';
import { useForceLayout } from './useForceLayout';
import { useElementSize } from './useElementSize';
import { mapGeometry } from './layout';
import type { Device, LinkType, TransferSnapshot } from '../../../shared/types';

const LINK_COLOR: Record<LinkType, string> = { direct: '#34c759', wired: '#0a84ff', wireless: '#ff9f0a' };
const OS_ICON: Record<Device['os'], string> = { windows: '\u{1F5A5}️', macos: '\u{1F34E}', linux: '\u{1F427}', unknown: '\u{1F4BB}' };

export function NetworkMap({ devices, transfers, selectedId, onSelect, onDrop }: {
  devices: Device[];
  transfers: TransferSnapshot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDrop: (deviceId: string, paths: string[]) => void;
}) {
  // Drawn at the container's real pixel size: one SVG unit is one pixel, so
  // nodes and labels stay the size they were designed at instead of being
  // scaled up with the window.
  const [containerRef, { width, height }] = useElementSize<HTMLDivElement>();
  const geometry = useMemo(() => mapGeometry(width, height), [width, height]);
  const nodes = useForceLayout(devices, width, height);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const { cx, cy, nodeRadius, hubRadius, labelOffset } = geometry;

  const activeByDevice = useMemo(() => {
    const map = new Map<string, TransferSnapshot>();
    for (const t of transfers) {
      if (t.status === 'active') map.set(t.deviceId, t);
    }
    return map;
  }, [transfers]);

  function handleDrop(e: React.DragEvent, deviceId: string) {
    e.preventDefault();
    setDropTargetId(null);
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.etherTransfer.getPathForFile(f))
      .filter((p): p is string => Boolean(p));
    if (paths.length) onDrop(deviceId, paths);
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      {width > 0 && height > 0 && (
        <svg width={width} height={height} className="select-none">
          {(['direct', 'wired', 'wireless'] as LinkType[]).map((ring) => (
            <circle
              key={ring}
              cx={cx}
              cy={cy}
              r={geometry.radii[ring]}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeDasharray="2 5"
            />
          ))}

          {nodes.map((n) => {
            const active = activeByDevice.get(n.id);
            const color = LINK_COLOR[n.device.linkType];
            return (
              <line
                key={`link-${n.id}`}
                x1={cx}
                y1={cy}
                x2={n.x ?? cx}
                y2={n.y ?? cy}
                stroke={color}
                strokeWidth={active ? 3 : 1.5}
                strokeLinecap="round"
                strokeDasharray={n.device.linkType === 'wireless' ? '5 5' : active ? '7 7' : undefined}
                opacity={active ? 1 : 0.45}
              >
                {active && (
                  <animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.7s" repeatCount="indefinite" />
                )}
              </line>
            );
          })}

          <g>
            <circle cx={cx} cy={cy} r={hubRadius} fill="#0071e3" />
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#fff"
            >
              You
            </text>
          </g>

          {nodes.map((n) => {
            const isTarget = dropTargetId === n.id;
            const isSelected = n.id === selectedId;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x ?? cx},${n.y ?? cy})`}
                onClick={() => onSelect(n.id)}
                onMouseEnter={() => setHoverId(n.id)}
                onMouseLeave={() => setHoverId(null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTargetId(n.id);
                }}
                onDragLeave={() => setDropTargetId((current) => (current === n.id ? null : current))}
                onDrop={(e) => handleDrop(e, n.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* A wider invisible disc keeps the node easy to hit and to drop onto. */}
                <circle r={nodeRadius + 14} fill="transparent" />
                {isTarget && (
                  <circle r={nodeRadius + 9} fill={LINK_COLOR[n.device.linkType]} fillOpacity={0.18} />
                )}
                <circle
                  r={nodeRadius}
                  className="fill-white dark:fill-neutral-900"
                  stroke={LINK_COLOR[n.device.linkType]}
                  strokeWidth={isSelected || isTarget ? 3 : 2}
                />
                <text textAnchor="middle" y={4} fontSize={Math.round(nodeRadius * 0.85)}>
                  {OS_ICON[n.device.os]}
                </text>
                <text
                  textAnchor="middle"
                  y={-labelOffset}
                  fontSize={11}
                  fontWeight={600}
                  fill="currentColor"
                >
                  {n.device.name}
                </text>
                {hoverId === n.id && (
                  <text textAnchor="middle" y={labelOffset + 9} fontSize={10} fill="currentColor" opacity={0.6}>
                    {n.device.linkType}
                    {n.device.latencyMs ? ` · ${n.device.latencyMs.toFixed(0)} ms` : ''}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
