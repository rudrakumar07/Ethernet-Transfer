import React from 'react';
import { useStore } from '../../store';
import { api } from '../../api/bridge';
import { ProgressBar, Button } from '../../components/ui';

export function TransferBar({ onOpenTransfers }: { onOpenTransfers: () => void }) {
  const transfers = useStore((s) => s.transfers);
  const active = transfers.filter(
    (t) => t.status === 'active' || t.status === 'paused' || t.status === 'scanning',
  );
  if (active.length === 0) return null;
  const top = active[0];
  const scanning = top.status === 'scanning';
  const fraction = top.totalBytes ? top.bytesDone / top.totalBytes : 0;

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-t border-neutral-200 dark:border-neutral-700 text-xs cursor-pointer"
      onClick={onOpenTransfers}>
      <span>{top.direction === 'send' ? '⬆' : '⬇'} {top.fileCount} file(s) {top.direction === 'send' ? '→' : '←'} <b>{top.deviceName}</b></span>
      <div className="flex-1"><ProgressBar fraction={scanning ? 0 : fraction} /></div>
      <span>
        {scanning
          ? 'Scanning folder…'
          : `${Math.round(fraction * 100)}% · ${(top.speedBps / 1e6).toFixed(0)} MB/s`}
      </span>
      {active.length > 1 && <span className="text-neutral-400">+{active.length - 1} more</span>}
      {!scanning && (
        <Button variant="ghost" onClick={(e) => {
          e.stopPropagation();
          void api.core[top.status === 'active' ? 'pauseTransfer' : 'resumeTransfer'](top.id);
        }}>{top.status === 'active' ? 'Pause' : 'Resume'}</Button>
      )}
    </div>
  );
}
