import React, { useState } from 'react';
import { useStore } from '../../store';
import { NetworkMap } from '../../components/map/NetworkMap';
import { RightPanel } from './RightPanel';
import { TransferBar } from './TransferBar';

export function HomeScreen({ onOpenTransfers }: { onOpenTransfers: () => void }) {
  const { devices, transfers, selectedDeviceId, selectDevice, sendFiles } = useStore();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col p-3 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <b className="text-sm">{devices.length} device{devices.length === 1 ? '' : 's'} nearby</b>
            <span className="text-[11px] text-neutral-500">Devices running EtherTransfer on this network appear automatically</span>
          </div>
          <div className="flex-1 min-h-0">
            {devices.length === 0 ? (
              <EmptyState />
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
          <div className="flex gap-4 text-[10px] text-neutral-500 px-1">
            <span className="text-green-600">— Direct cable</span>
            <span className="text-blue-500">— LAN wired</span>
            <span className="text-amber-500">- - Wi-Fi</span>
            <span className="ml-auto">Drag files onto a device to send</span>
          </div>
        </div>
        <RightPanel />
      </div>
      <TransferBar onOpenTransfers={onOpenTransfers} />
    </div>
  );
}

function EmptyState() {
  const [elapsed, setElapsed] = useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 gap-2">
      <div className="text-4xl">{'\u{1F50C}'}</div>
      <div>Looking for other devices…</div>
      {elapsed > 15 && (
        <div className="text-xs max-w-xs">
          Can&apos;t see your device? Check that EtherTransfer is running on both machines, that they are
          on the same network or joined by a cable, and that EtherTransfer is allowed through your firewall.
        </div>
      )}
    </div>
  );
}
