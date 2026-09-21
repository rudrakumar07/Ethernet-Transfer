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
    <div
      className="flex items-center gap-3 px-5 py-2.5 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
      onClick={onOpenTransfers}
    >
      <span className="truncate shrink-0">
        <span aria-hidden>{top.direction === 'send' ? '↑' : '↓'}</span> {top.fileCount.toLocaleString()} file(s){' '}
        {top.direction === 'send' ? 'to' : 'from'} <b>{top.deviceName}</b>
      </span>
      <div className="flex-1 min-w-0"><ProgressBar fraction={fraction} indeterminate={scanning} /></div>
      <span className="shrink-0 tabular-nums text-neutral-500">
        {scanning
          ? 'Scanning folder…'
          : `${Math.round(fraction * 100)}% · ${(top.speedBps / 1e6).toFixed(1)} MB/s`}
      </span>
      {active.length > 1 && <span className="text-neutral-400 shrink-0">+{active.length - 1} more</span>}
      {!scanning && (
        <Button variant="ghost" onClick={(e) => {
          e.stopPropagation();
          void api.core[top.status === 'active' ? 'pauseTransfer' : 'resumeTransfer'](top.id);
        }}>{top.status === 'active' ? 'Pause' : 'Resume'}</Button>
      )}
    </div>
  );
}
