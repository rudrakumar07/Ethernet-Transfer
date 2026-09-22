import React from 'react';
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';

/** Confined to this folder per spec §12.5: only place importing recharts. */
export function ThroughputSparkline({ samples, height = 56 }: {
  samples: { sent: number; received: number }[];
  height?: number;
}) {
  const data = samples.map((s, i) => ({ i, sent: s.sent / 1e6, received: s.received / 1e6 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <YAxis hide domain={[0, (max: number) => Math.max(1, max * 1.15)]} />
        <Area
          type="monotone"
          dataKey="received"
          stroke="var(--success)"
          fill="var(--success)"
          fillOpacity={0.12}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="sent"
          stroke="var(--accent)"
          fill="var(--accent)"
          fillOpacity={0.16}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
