import React, { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { EmptyState, PageHeader, SegmentedToggle, Tile } from '../../components/ui';
import { DevicesOverTimeChart, ThroughputChart, PerDeviceBarChart } from '../../components/charts/DashboardCharts';
import type { StatsRange, StatsSnapshot } from '../../../shared/types';

export function DashboardScreen() {
  const fetchStats = useStore((s) => s.fetchStats);
  const [range, setRange] = useState<StatsRange>('1h');
  const [stats, setStats] = useState<StatsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStats(range).then((s) => { if (!cancelled) setStats(s); });
    const interval = setInterval(() => fetchStats(range).then((s) => { if (!cancelled) setStats(s); }), 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [range, fetchStats]);

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <PageHeader
        title="Dashboard"
        subtitle="Devices seen and data moved over time"
        actions={
          <SegmentedToggle
            value={range}
            options={[
              { value: '15m', label: '15 min' },
              { value: '1h', label: '1 hour' },
              { value: '24h', label: '24 hours' },
            ]}
            onChange={setRange}
          />
        }
      />
      {stats && (
        // min-w-0 on the grid children: without it a grid item defaults to
        // min-width:auto and the charts pushed their cards past the window edge.
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Tile label="Devices online over time">
            <DevicesOverTimeChart points={stats.devicesOnline} />
          </Tile>
          <Tile label="Throughput (sent / received)">
            <ThroughputChart sent={stats.throughputSent} received={stats.throughputReceived} />
          </Tile>
          <Tile label="Data transferred per device" className="lg:col-span-2">
            {stats.perDeviceBytes.length === 0 ? (
              <EmptyState
                icon="📊"
                title="No transfers recorded yet"
                hint="Once you send or receive files, totals per device appear here."
              />
            ) : (
              <PerDeviceBarChart data={stats.perDeviceBytes} />
            )}
          </Tile>
        </div>
      )}
    </div>
  );
}
