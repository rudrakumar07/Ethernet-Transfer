import React, { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { Card, DashboardIcon, EmptyState, PageHeader, SegmentedControl } from '../../components/ui';
import { DevicesOverTimeChart, ThroughputChart, PerDeviceBarChart } from '../../components/charts/DashboardCharts';
import type { StatsRange, StatsSnapshot } from '../../../shared/types';

export function DashboardScreen() {
  const fetchStats = useStore((s) => s.fetchStats);
  const [range, setRange] = useState<StatsRange>('1h');
  const [stats, setStats] = useState<StatsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchStats(range)
        .then((s) => { if (!cancelled) setStats(s); })
        .catch(() => undefined);
    void load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [range, fetchStats]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="flex flex-col gap-5 px-8 py-7">
        <PageHeader
          title="Dashboard"
          subtitle="Devices seen and data moved over time"
          actions={
            <SegmentedControl
              label="Time range"
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
          // min-w-0 on the cards: grid items otherwise default to
          // min-width:auto and the charts push them past the window edge.
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Devices online">
              <DevicesOverTimeChart points={stats.devicesOnline} />
            </Card>
            <Card title="Throughput" actions={<span className="text-[12px] text-fg-2">MB/s</span>}>
              <ThroughputChart sent={stats.throughputSent} received={stats.throughputReceived} />
            </Card>
            <Card title="Data transferred per device" className="lg:col-span-2">
              {stats.perDeviceBytes.length === 0 ? (
                <EmptyState
                  icon={<DashboardIcon size={28} />}
                  title="No transfers recorded yet"
                  hint="Once you send or receive files, totals per device appear here."
                />
              ) : (
                <PerDeviceBarChart data={stats.perDeviceBytes} />
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
