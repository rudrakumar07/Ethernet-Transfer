import React from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell,
} from 'recharts';
import type { StatsSnapshot } from '../../../shared/types';

/** Chart chrome drawn from the theme tokens, so it follows light and dark. */
const AXIS_TICK = { fontSize: 11, fill: 'var(--fg-2)' };
const GRID_STROKE = 'var(--stroke)';
const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--stroke)',
  borderRadius: 4,
  color: 'var(--fg)',
  fontSize: 12,
  boxShadow: '0 8px 16px rgba(0,0,0,0.14)',
};
const TOOLTIP_LABEL: React.CSSProperties = { color: 'var(--fg-2)' };

function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DevicesOverTimeChart({ points }: { points: StatsSnapshot['devicesOnline'] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={points.map((p) => ({ ...p, label: fmtTime(p.t) }))} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={40} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={28} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} cursor={{ stroke: GRID_STROKE }} />
        <Area type="stepAfter" dataKey="value" name="Devices" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.14} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ThroughputChart({ sent, received }: {
  sent: StatsSnapshot['throughputSent']; received: StatsSnapshot['throughputReceived'];
}) {
  const merged = sent.map((p, i) => ({
    label: fmtTime(p.t),
    sent: p.value / 1e6,
    received: (received[i]?.value ?? 0) / 1e6,
  }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={merged} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={40} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={36} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} cursor={{ stroke: GRID_STROKE }} />
        <Area type="monotone" dataKey="sent" name="Sent" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.16} strokeWidth={2} />
        <Area type="monotone" dataKey="received" name="Received" stroke="var(--success)" fill="var(--success)" fillOpacity={0.14} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const LINK_FILL: Record<string, string> = {
  direct: 'var(--link-direct)',
  wired: 'var(--link-wired)',
  wireless: 'var(--link-wireless)',
};

export function PerDeviceBarChart({ data }: { data: StatsSnapshot['perDeviceBytes'] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 36)}>
      <BarChart data={data.map((d) => ({ ...d, gb: d.bytes / 1e9 }))} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
        <XAxis type="number" unit=" GB" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
        <YAxis type="category" dataKey="deviceName" tick={AXIS_TICK} tickLine={false} axisLine={false} width={120} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} cursor={{ fill: 'var(--subtle-hover)' }} />
        <Bar dataKey="gb" name="GB" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={LINK_FILL[d.linkType] ?? 'var(--accent)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
