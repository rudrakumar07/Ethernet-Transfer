import React, { useState } from 'react';
import { api } from '../../api/bridge';
import type { Device } from '../../../shared/types';
import { Card, DeviceIcon, DropIcon, EmptyState, InfoIcon, LinkBadge, PlugIcon, SearchIcon, ToggleSwitch } from '../../components/ui';

const LINK_TILE: Record<Device['linkType'], string> = {
  direct: 'bg-link-direct-bg text-link-direct',
  wired: 'bg-link-wired-bg text-link-wired',
  wireless: 'bg-link-wireless-bg text-link-wireless',
};

const OS_LABEL: Record<Device['os'], string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux', unknown: 'Unknown OS' };

function DeviceRow({ device, selected, onSelect, onDropFiles }: {
  device: Device;
  selected: boolean;
  onSelect: () => void;
  onDropFiles: (files: File[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const meta = [OS_LABEL[device.os], device.latencyMs ? `${device.latencyMs.toFixed(1)} ms` : null, device.trusted ? 'trusted' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      className={`relative rounded-control transition-colors ${selected ? 'bg-selected' : ''} ${
        dragOver ? 'outline outline-2 outline-dashed outline-accent -outline-offset-2' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      // dragleave also fires when the pointer moves onto a child element; only
      // clear the highlight when it has really left the row.
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onDropFiles(files);
      }}
    >
      {selected && <span className="absolute left-0 top-[22px] w-[3px] h-4 rounded-full bg-accent" />}
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`w-full flex items-center gap-3 h-[60px] px-3 rounded-control text-left ${selected ? '' : 'hover:bg-subtle-hover'}`}
      >
        <span className={`w-9 h-9 rounded-control flex items-center justify-center shrink-0 ${LINK_TILE[device.linkType]}`}>
          <DeviceIcon os={device.os} size={20} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold text-fg truncate">{device.name}</span>
          <span className="block text-[12px] text-fg-2 truncate">{dragOver ? 'Release to send' : meta}</span>
        </span>
        <LinkBadge linkType={device.linkType} />
      </button>

      {selected && (
        <div className="px-3 pb-3 pl-[60px] space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-fg">Trust this device</span>
            <ToggleSwitch
              checked={device.trusted}
              label={`Trust ${device.name}`}
              onChange={(checked) => void api.core.setTrusted(device.id, checked).catch(() => undefined)}
            />
          </div>
          <div className="text-[12px] text-fg-2 leading-relaxed">
            {device.trusted
              ? 'Transfers from this device are accepted without asking.'
              : 'You will be asked before each transfer from this device.'}
          </div>
          <div>
            <div className="text-[12px] text-fg-2 mb-1">Addresses</div>
            <ul className="font-mono text-[12px] text-fg space-y-0.5">
              {device.addresses.map((a) => (
                <li key={`${a.iface}-${a.address}`} className="truncate">
                  {a.address} <span className="text-fg-2">· {a.iface}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

export function DeviceList({ devices, query, selectedId, onSelect, onDropFiles }: {
  devices: Device[];
  query: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDropFiles: (deviceId: string, files: File[]) => void;
}) {
  const needle = query.trim().toLowerCase();
  const shown = needle ? devices.filter((d) => d.name.toLowerCase().includes(needle)) : devices;

  return (
    <Card
      title="Nearby devices"
      actions={<span className="text-[12px] text-fg-2">{devices.length} online</span>}
      className="min-h-0 flex-1"
    >
      {devices.length === 0 ? (
        <LookingForDevices />
      ) : shown.length === 0 ? (
        <EmptyState icon={<SearchIcon size={28} />} title="No devices match" hint={`Nothing nearby is named “${query.trim()}”.`} />
      ) : (
        <ul className="flex flex-col gap-0.5 overflow-y-auto min-h-0 -mx-1 px-1">
          {shown.map((d) => (
            <DeviceRow
              key={d.id}
              device={d}
              selected={d.id === selectedId}
              onSelect={() => onSelect(d.id === selectedId ? null : d.id)}
              onDropFiles={(files) => onDropFiles(d.id, files)}
            />
          ))}
        </ul>
      )}
      {devices.length > 0 && (
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-control bg-layer text-[12px] text-fg-2">
            <InfoIcon size={16} className="text-accent-text" />
            Drag files or folders onto a device to send them.
          </div>
        </div>
      )}
    </Card>
  );
}

function LookingForDevices() {
  const [elapsed, setElapsed] = useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <EmptyState
      icon={elapsed > 15 ? <PlugIcon size={32} /> : <DropIcon size={32} />}
      title="Looking for other devices…"
      hint={
        elapsed > 15
          ? 'Check that EtherTransfer is running on both machines, that they are on the same network or joined by a cable, and that EtherTransfer is allowed through your firewall.'
          : 'Open EtherTransfer on another machine on this network and it appears here on its own.'
      }
    />
  );
}
