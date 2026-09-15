import React from 'react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';

/** Confined to this folder per spec §12.5: only place importing recharts. */
export function Sparkline({ data, color }: { data: { t: number; value: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
