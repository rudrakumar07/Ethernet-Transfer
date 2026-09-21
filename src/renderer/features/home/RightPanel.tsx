import React from 'react';
import { useStore } from '../../store';
import { api } from '../../api/bridge';
import { Tile, SegmentedToggle, Button, Checkbox, StatusPill } from '../../components/ui';

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

export function RightPanel() {
  const { rightPanelMode, setRightPanelMode, selectedDeviceId, devices, statsTick, transfers } =
    useStore();
  const device = devices.find((d) => d.id === selectedDeviceId);
  const mode = selectedDeviceId ? rightPanelMode : 'network';
  const deviceTransfers = transfers.filter((t) => t.deviceId === selectedDeviceId).slice(0, 5);

  return (
    <aside className="w-[240px] shrink-0 border-l border-neutral-200 dark:border-neutral-800 p-4 flex flex-col gap-3 overflow-y-auto">
      {selectedDeviceId && (
        <SegmentedToggle
          value={mode}
          options={[{ value: 'network', label: 'Network' }, { value: 'device', label: 'Device' }]}
          onChange={setRightPanelMode}
        />
      )}

      {mode === 'network' || !device ? (
        <>
          <Tile label="Devices online">
            <div className="text-2xl font-semibold tabular-nums">
              {statsTick?.devicesOnline ?? devices.length}
            </div>
          </Tile>
          <Tile label="Sending now">
            <div className="text-2xl font-semibold tabular-nums">
              {((statsTick?.speedSentBps ?? 0) / 1e6).toFixed(1)}
              <span className="text-xs font-normal text-neutral-500 ml-1">MB/s</span>
            </div>
          </Tile>
          <Tile label="Receiving now">
            <div className="text-2xl font-semibold tabular-nums">
              {((statsTick?.speedReceivedBps ?? 0) / 1e6).toFixed(1)}
              <span className="text-xs font-normal text-neutral-500 ml-1">MB/s</span>
            </div>
          </Tile>
          {!selectedDeviceId && (
            <div className="text-[11px] text-neutral-500 leading-relaxed mt-1">
              Select a device on the map to see its details and send files to it.
            </div>
          )}
        </>
      ) : (
        <>
          <div>
            <div className="font-semibold text-sm truncate">{device.name}</div>
            <div className="text-[11px] text-neutral-500 capitalize">
              {device.os} · {device.linkType}
              {device.latencyMs ? ` · ${device.latencyMs.toFixed(0)} ms` : ''}
            </div>
          </div>

          <Checkbox
            checked={device.trusted}
            onChange={(checked) => void api.core.setTrusted(device.id, checked)}
            label="Trust this device"
            hint="Accept its transfers without asking."
          />

          <Tile label="Addresses">
            <div className="space-y-0.5">
              {device.addresses.map((a) => (
                <div key={`${a.iface}-${a.address}`} className="font-mono text-[10px] truncate">
                  {a.address}
                  <span className="text-neutral-500"> · {a.linkType}</span>
                </div>
              ))}
            </div>
          </Tile>

          <Tile label="Recent transfers">
            {deviceTransfers.length === 0 ? (
              <div className="text-[11px] text-neutral-500">None yet</div>
            ) : (
              <div className="space-y-1.5">
                {deviceTransfers.map((t) => (
                  <div key={t.id} className="flex items-center gap-1.5 text-[10px]">
                    <span aria-hidden>{t.direction === 'send' ? '↑' : '↓'}</span>
                    <span className="text-neutral-500">{formatBytes(t.bytesDone)}</span>
                    <span className="ml-auto"><StatusPill status={t.status} /></span>
                  </div>
                ))}
              </div>
            )}
          </Tile>

          <div className="mt-auto flex flex-col gap-2 pt-2">
            <SendError />
            {/* Two entry points: Windows and Linux cannot offer files and
                folders in a single native dialog. */}
            <Button
              onClick={async () => {
                const paths = await api.main.pickFiles();
                if (paths.length) await useStore.getState().sendFiles(device.id, paths);
              }}
            >
              Send files…
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const paths = await api.main.pickFolders();
                if (paths.length) await useStore.getState().sendFiles(device.id, paths);
              }}
            >
              Send folder…
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}

function SendError() {
  const sendError = useStore((s) => s.sendError);
  const clearSendError = useStore((s) => s.clearSendError);
  if (!sendError) return null;
  return (
    <div className="text-[11px] rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 px-2 py-1.5">
      <div className="flex items-start gap-2">
        <span className="flex-1">Couldn&apos;t send: {sendError}</span>
        <button className="text-red-500 hover:text-red-700" onClick={clearSendError} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
