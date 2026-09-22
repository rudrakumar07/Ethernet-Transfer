import React, { useMemo, useState } from 'react';
import { useForceLayout } from './useForceLayout';
import { useElementSize } from './useElementSize';
import { mapGeometry } from './layout';
import type { Device, LinkType, TransferSnapshot } from '../../../shared/types';

/** Theme tokens, so the map follows light and dark like the rest of the UI. */
const LINK_COLOR: Record<LinkType, string> = {
  direct: 'var(--link-direct)',
  wired: 'var(--link-wired)',
  wireless: 'var(--link-wireless)',
};

export function NetworkMap({ devices, transfers, selectedId, onSelect, onDropFiles }: {
  devices: Device[];
  transfers: TransferSnapshot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Files dropped on a device. Resolving them to paths is left to the caller:
   * this component stays presentational and never reaches into the preload
   * bridge itself.
   */
  onDropFiles: (deviceId: string, files: File[]) => void;
}) {
  // Drawn at the container's real pixel size: one SVG unit is one pixel, so
  // nodes and labels stay the size they were designed at.
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
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onDropFiles(deviceId, files);
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      {width > 0 && height > 0 && (
        <svg width={width} height={height} className="select-none block" role="img" aria-label="Network map">
          {(['direct', 'wired', 'wireless'] as LinkType[]).map((ring) => (
            <circle
              key={ring}
              cx={cx}
              cy={cy}
              r={geometry.radii[ring]}
              fill="none"
              style={{ stroke: 'var(--stroke)' }}
              strokeDasharray="2 5"
            />
          ))}

          {nodes.map((n) => {
            const active = activeByDevice.get(n.id);
            return (
              <line
                key={`link-${n.id}`}
                x1={cx}
                y1={cy}
                x2={n.x ?? cx}
                y2={n.y ?? cy}
                style={{ stroke: LINK_COLOR[n.device.linkType] }}
                strokeWidth={active ? 3 : 1.5}
                strokeLinecap="round"
                strokeDasharray={n.device.linkType === 'wireless' ? '5 5' : active ? '7 7' : undefined}
                opacity={active ? 1 : 0.6}
              >
                {active && (
                  <animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.7s" repeatCount="indefinite" />
                )}
              </line>
            );
          })}

          <circle cx={cx} cy={cy} r={hubRadius} style={{ fill: 'var(--accent)' }} />
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            style={{ fill: 'var(--on-accent)' }}
          >
            You
          </text>

          {nodes.map((n) => {
            const isTarget = dropTargetId === n.id;
            const isSelected = n.id === selectedId;
            const color = LINK_COLOR[n.device.linkType];
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
                <title>{`${n.device.name} — drop files to send`}</title>
                {/* A wider invisible disc keeps the node easy to hit and to drop onto. */}
                <circle r={nodeRadius + 14} fill="transparent" />
                {(isTarget || isSelected) && (
                  <circle r={nodeRadius + 7} style={{ fill: color }} fillOpacity={isTarget ? 0.22 : 0.12} />
                )}
                <circle
                  r={nodeRadius}
                  style={{ fill: 'var(--card)', stroke: color }}
                  strokeWidth={isSelected || isTarget ? 3 : 2}
                />
                <text
                  textAnchor="middle"
                  y={-labelOffset}
                  fontSize={11}
                  fontWeight={600}
                  style={{ fill: 'var(--fg)' }}
                >
                  {n.device.name}
                </text>
                {hoverId === n.id && (
                  <text textAnchor="middle" y={labelOffset + 9} fontSize={10} style={{ fill: 'var(--fg-2)' }}>
                    {n.device.latencyMs ? `${n.device.latencyMs.toFixed(0)} ms` : 'measuring…'}
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
