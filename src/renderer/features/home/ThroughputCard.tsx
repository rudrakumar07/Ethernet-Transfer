import React from 'react';
import { ThroughputSparkline } from '../../components/charts/Sparkline';
import { ArrowDownIcon, ArrowUpIcon, Card } from '../../components/ui';
import { formatSpeed } from '../../lib/format';
import { peakOf, type ThroughputSample } from '../../lib/throughput';

/**
 * Live throughput on Home: current send and receive rates, and the last minute
 * as a sparkline. Always on screen - it used to live in the side panel's
 * Network tab, which gave way to the device details as soon as a device was
 * selected, so it vanished during exactly the send you wanted to watch.
 */
export function ThroughputCard({ sentBps, receivedBps, history }: {
  sentBps: number;
  receivedBps: number;
  history: ThroughputSample[];
}) {
  const peak = peakOf(history);
  return (
    <Card title="Throughput" className="shrink-0" actions={<span className="text-[12px] text-fg-2">Last minute</span>}>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] text-fg-2">
            <ArrowUpIcon size={12} className="text-accent-text" />
            Sending
          </div>
          <div className="text-[20px] font-semibold tabular-nums text-fg mt-0.5">{formatSpeed(sentBps)}</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[12px] text-fg-2">
            <ArrowDownIcon size={12} className="text-success" />
            Receiving
          </div>
          <div className="text-[20px] font-semibold tabular-nums text-fg mt-0.5">{formatSpeed(receivedBps)}</div>
        </div>
      </div>
      <div className="mt-2 -mx-1">
        <ThroughputSparkline samples={history} height={52} />
      </div>
      <div className="text-[12px] text-fg-2 mt-1">
        Peak {formatSpeed(peak)}
      </div>
    </Card>
  );
}
