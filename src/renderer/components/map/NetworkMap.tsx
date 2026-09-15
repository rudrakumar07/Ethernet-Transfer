import React, { useMemo, useState } from 'react';
import { useForceLayout } from './useForceLayout';
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
  const width = 480;
  const height = 320;
  const nodes = useForceLayout(devices, width, height);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const cx = width / 2;
  const cy = height / 2;

  const activeByDevice = useMemo(() => {
    const map = new Map<string, TransferSnapshot>();
    for (const t of transfers) {
      if (t.status === 'active') map.set(t.deviceId, t);
    }
    return map;
  }, [transfers]);

  function handleDrop(e: React.DragEvent, deviceId: string) {
    e.preventDefault();
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => window.etherTransfer.getPathForFile(f))
      .filter((p): p is string => Boolean(p));
    if (paths.length) onDrop(deviceId, paths);
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      <circle cx={cx} cy={cy} r={70} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeDasharray="2 4" />
      <circle cx={cx} cy={cy} r={120} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeDasharray="2 4" />
      <circle cx={cx} cy={cy} r={170} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeDasharray="2 4" />

      {nodes.map((n) => {
        const active = activeByDevice.get(n.id);
        const color = LINK_COLOR[n.device.linkType];
        return (
          <g key={`link-${n.id}`}>
            <line x1={cx} y1={cy} x2={n.x ?? cx} y2={n.y ?? cy} stroke={color} strokeWidth={active ? 4 : 2}
              strokeDasharray={n.device.linkType === 'wireless' ? '5 4' : active ? '6 6' : undefined}
              opacity={active ? 1 : 0.6}>
              {active && (
                <animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.6s" repeatCount="indefinite" />
              )}
            </line>
          </g>
        );
      })}

      <circle cx={cx} cy={cy} r={19} fill="#0071e3" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">You</text>

      {nodes.map((n) => (
        <g
          key={n.id}
          transform={`translate(${n.x ?? cx},${n.y ?? cy})`}
          onClick={() => onSelect(n.id)}
          onMouseEnter={() => setHoverId(n.id)}
          onMouseLeave={() => setHoverId(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, n.id)}
          style={{ cursor: 'pointer' }}
        >
          <circle r={15} fill="var(--bg-secondary, #fff)" stroke={LINK_COLOR[n.device.linkType]}
            strokeWidth={n.id === selectedId ? 3.5 : 2.5} />
          <text textAnchor="middle" y={4} fontSize={11}>{OS_ICON[n.device.os]}</text>
          <text textAnchor="middle" y={-22} fontSize={10} fontWeight={600} fill="currentColor">{n.device.name}</text>
          {hoverId === n.id && (
            <text textAnchor="middle" y={30} fontSize={8} fill="currentColor" opacity={0.7}>
              {n.device.linkType} {n.device.latencyMs ? `· ${n.device.latencyMs.toFixed(1)} ms` : ''}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
