import React, { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { SegmentedToggle, Tile } from '../../components/ui';
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
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Dashboard</h3>
        <SegmentedToggle
          value={range}
          options={[{ value: '15m', label: '15 min' }, { value: '1h', label: '1 hour' }, { value: '24h', label: '24 hours' }]}
          onChange={setRange}
        />
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Devices online over time">
            <DevicesOverTimeChart points={stats.devicesOnline} />
          </Tile>
          <Tile label="Throughput (sent / received)">
            <ThroughputChart sent={stats.throughputSent} received={stats.throughputReceived} />
          </Tile>
          <div className="col-span-2">
            <Tile label="Data transferred per device">
              <PerDeviceBarChart data={stats.perDeviceBytes} />
            </Tile>
          </div>
        </div>
      )}
    </div>
  );
}
