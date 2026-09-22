import React, { useState } from 'react';
import { useStore } from '../../store';
import { api } from '../../api/bridge';
import { NetworkMap } from '../../components/map/NetworkMap';
import { Button, Card, FileIcon, FolderIcon, InfoBar, PageHeader, SearchBox } from '../../components/ui';
import { summarizeLinks } from '../../lib/format';
import { DeviceList } from './DeviceList';
import { ThroughputCard } from './ThroughputCard';
import { RecentTransfers } from './RecentTransfers';

const LEGEND: { label: string; color: string; dashed?: boolean }[] = [
  { label: 'Direct cable', color: 'var(--link-direct)' },
  { label: 'Ethernet', color: 'var(--link-wired)' },
  { label: 'Wi-Fi', color: 'var(--link-wireless)', dashed: true },
];

export function HomeScreen({ onOpenTransfers }: { onOpenTransfers: () => void }) {
  const devices = useStore((s) => s.devices);
  const transfers = useStore((s) => s.transfers);
  const selectedDeviceId = useStore((s) => s.selectedDeviceId);
  const selectDevice = useStore((s) => s.selectDevice);
  const sendFiles = useStore((s) => s.sendFiles);
  const sendError = useStore((s) => s.sendError);
  const clearSendError = useStore((s) => s.clearSendError);
  const statsTick = useStore((s) => s.statsTick);
  const throughput = useStore((s) => s.throughput);
  const [query, setQuery] = useState('');

  // A selection can outlive its device (it went offline); treat that as none,
  // so the send buttons never aim at something that is no longer there.
  const selected = devices.find((d) => d.id === selectedDeviceId);

  const sendDropped = (deviceId: string, files: File[]) => {
    const paths = files.map((f) => api.getPathForFile(f)).filter((p): p is string => Boolean(p));
    if (paths.length) void sendFiles(deviceId, paths);
  };

  const pickAndSend = async (pick: () => Promise<string[]>) => {
    if (!selected) return;
    const paths = await pick().catch(() => [] as string[]);
    if (paths.length) await sendFiles(selected.id, paths);
  };

  const links = summarizeLinks(devices);
  const subtitle =
    devices.length === 0
      ? 'Looking for devices running EtherTransfer on this network'
      : `${devices.length} device${devices.length === 1 ? '' : 's'} nearby${links ? ` on ${links}` : ''}`;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="h-full flex flex-col gap-5 px-8 py-7">
        <PageHeader title="Home" subtitle={subtitle} />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="accent"
            icon={<FileIcon size={14} />}
            disabled={!selected}
            title={selected ? `Send files to ${selected.name}` : 'Select a device first'}
            onClick={() => void pickAndSend(() => api.main.pickFiles())}
          >
            Send files
          </Button>
          <Button
            icon={<FolderIcon size={14} />}
            disabled={!selected}
            title={selected ? `Send a folder to ${selected.name}` : 'Select a device first'}
            onClick={() => void pickAndSend(() => api.main.pickFolders())}
          >
            Send folder
          </Button>
          <span className="text-[12px] text-fg-2 ml-1">
            {selected ? `to ${selected.name}` : devices.length > 0 ? 'Select a device to send to it' : ''}
          </span>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search devices"
            label="Search devices"
            className="ml-auto w-64"
          />
        </div>

        {sendError && (
          <InfoBar severity="error" title="Couldn’t send" onClose={clearSendError}>
            {sendError}
          </InfoBar>
        )}

        {/* Devices and transfers share the left column; the map takes the tall
            right-hand slot. Stacked three deep on one side, the map was left
            about 130px, its rings collapsed and every device piled onto "You". */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[520px]">
          <div className="flex flex-col gap-4 min-h-0 min-w-0">
            <DeviceList
              devices={devices}
              query={query}
              selectedId={selected?.id ?? null}
              onSelect={selectDevice}
              onDropFiles={sendDropped}
            />
            <RecentTransfers transfers={transfers} onOpenTransfers={onOpenTransfers} />
          </div>

          <div className="flex flex-col gap-4 min-h-0 min-w-0">
            <Card title="Network" className="flex-1 min-h-[320px]">
              <div className="flex-1 min-h-0">
                {devices.length > 0 ? (
                  <NetworkMap
                    devices={devices}
                    transfers={transfers}
                    selectedId={selected?.id ?? null}
                    onSelect={selectDevice}
                    onDropFiles={sendDropped}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-[12px] text-fg-2">
                    Devices appear on the map as they are found.
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 pt-2 text-[12px] text-fg-2">
                {LEGEND.map((l) => (
                  <span key={l.label} className="flex items-center gap-1.5">
                    <svg width="16" height="4" aria-hidden="true">
                      <line
                        x1="0"
                        y1="2"
                        x2="16"
                        y2="2"
                        style={{ stroke: l.color }}
                        strokeWidth="2"
                        strokeDasharray={l.dashed ? '4 3' : undefined}
                      />
                    </svg>
                    {l.label}
                  </span>
                ))}
              </div>
            </Card>

            <ThroughputCard
              sentBps={statsTick?.speedSentBps ?? 0}
              receivedBps={statsTick?.speedReceivedBps ?? 0}
              history={throughput}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
