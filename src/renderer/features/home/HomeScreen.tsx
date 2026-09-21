import React, { useState } from 'react';
import { useStore } from '../../store';
import { NetworkMap } from '../../components/map/NetworkMap';
import { RightPanel } from './RightPanel';
import { TransferBar } from './TransferBar';
import { EmptyState, PageHeader } from '../../components/ui';

const LEGEND: { label: string; color: string; dashed?: boolean }[] = [
  { label: 'Direct cable', color: '#34c759' },
  { label: 'LAN wired', color: '#0a84ff' },
  { label: 'Wi-Fi', color: '#ff9f0a', dashed: true },
];

export function HomeScreen({ onOpenTransfers }: { onOpenTransfers: () => void }) {
  const { devices, transfers, selectedDeviceId, selectDevice, sendFiles } = useStore();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col p-5 min-w-0">
          <PageHeader
            title={`${devices.length} device${devices.length === 1 ? '' : 's'} nearby`}
            subtitle="Devices running EtherTransfer on this network appear automatically"
          />

          <div className="flex-1 min-h-0">
            {devices.length === 0 ? (
              <LookingForDevices />
            ) : (
              <NetworkMap
                devices={devices}
                transfers={transfers}
                selectedId={selectedDeviceId}
                onSelect={selectDevice}
                onDrop={(deviceId, paths) => void sendFiles(deviceId, paths)}
              />
            )}
          </div>

          <div className="flex items-center gap-4 text-[10px] text-neutral-500 pt-3">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <svg width="16" height="4" aria-hidden>
                  <line
                    x1="0"
                    y1="2"
                    x2="16"
                    y2="2"
                    stroke={l.color}
                    strokeWidth="2"
                    strokeDasharray={l.dashed ? '4 3' : undefined}
                  />
                </svg>
                {l.label}
              </span>
            ))}
            <span className="ml-auto">Drag files or folders onto a device to send</span>
          </div>
        </div>
        <RightPanel />
      </div>
      <TransferBar onOpenTransfers={onOpenTransfers} />
    </div>
  );
}

function LookingForDevices() {
  const [elapsed, setElapsed] = useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="h-full flex items-center justify-center">
      <EmptyState
        icon="🔌"
        title="Looking for other devices…"
        hint={
          elapsed > 15
            ? 'Check that EtherTransfer is running on both machines, that they are on the same network or joined by a cable, and that EtherTransfer is allowed through your firewall.'
            : 'Start EtherTransfer on another machine on this network.'
        }
      />
    </div>
  );
}
