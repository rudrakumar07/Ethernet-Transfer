import React from 'react';
import { useStore } from '../../store';
import { api } from '../../api/bridge';
import { Tile, SegmentedToggle, Button } from '../../components/ui';

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
    <div className="w-[220px] border-l border-neutral-200 dark:border-neutral-700 p-3 flex flex-col gap-3 overflow-y-auto">
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
            <div className="text-lg font-semibold">{statsTick?.devicesOnline ?? devices.length}</div>
          </Tile>
          <Tile label="Speed now">
            <div className="text-lg font-semibold">
              {((statsTick?.speedSentBps ?? 0) / 1e6).toFixed(1)} MB/s
            </div>
          </Tile>
        </>
      ) : (
        <>
          <div className="font-semibold text-sm">{device.name}</div>
          <div className="text-xs text-neutral-500">{device.os} · {device.trusted ? '✓ Trusted' : 'Not trusted'}</div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={device.trusted}
              onChange={(e) => void api.core.setTrusted(device.id, e.target.checked)}
            />
            Trust this device
          </label>
          <div className="text-xs">
            <div className="uppercase text-[10px] text-neutral-500 mb-1">Addresses</div>
            {device.addresses.map((a) => (
              <div key={a.address} className="font-mono text-[10px]">{a.address} ({a.linkType})</div>
            ))}
          </div>
          <div className="text-xs">Latency <b>{device.latencyMs ? `${device.latencyMs.toFixed(1)} ms` : '–'}</b></div>
          <div className="text-xs">
            <div className="uppercase text-[10px] text-neutral-500 mb-1">Recent transfers</div>
            {deviceTransfers.length === 0 && <div className="text-neutral-400">None yet</div>}
            {deviceTransfers.map((t) => (
              <div key={t.id} className="text-[10px]">{t.direction === 'send' ? '⬆' : '⬇'} {formatBytes(t.bytesDone)} · {t.status}</div>
            ))}
          </div>
          <div className="mt-auto">
            <Button onClick={async () => {
              const paths = await api.main.pickFiles();
              if (paths.length) await useStore.getState().sendFiles(device.id, paths);
            }}>Send files…</Button>
          </div>
        </>
      )}
    </div>
  );
}
