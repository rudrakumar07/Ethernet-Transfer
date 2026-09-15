import React from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell,
} from 'recharts';
import type { StatsSnapshot } from '../../../shared/types';

function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DevicesOverTimeChart({ points }: { points: StatsSnapshot['devicesOnline'] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={points.map((p) => ({ ...p, label: fmtTime(p.t) }))}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={40} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
        <Tooltip />
        <Area type="stepAfter" dataKey="value" stroke="#0071e3" fill="#0071e3" fillOpacity={0.15} />
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
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={merged}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={40} />
        <YAxis tick={{ fontSize: 10 }} width={30} unit=" MB/s" />
        <Tooltip />
        <Area type="monotone" dataKey="sent" stroke="#34c759" fill="#34c759" fillOpacity={0.2} />
        <Area type="monotone" dataKey="received" stroke="#0a84ff" fill="#0a84ff" fillOpacity={0.2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PerDeviceBarChart({ data }: { data: StatsSnapshot['perDeviceBytes'] }) {
  const colors: Record<string, string> = { direct: '#34c759', wired: '#0a84ff', wireless: '#ff9f0a' };
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 32)}>
      <BarChart data={data.map((d) => ({ ...d, gb: d.bytes / 1e9 }))} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis type="number" unit=" GB" tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="deviceName" tick={{ fontSize: 10 }} width={100} />
        <Tooltip />
        <Bar dataKey="gb">
          {data.map((d, i) => (
            <Cell key={i} fill={colors[d.linkType] ?? '#0071e3'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
