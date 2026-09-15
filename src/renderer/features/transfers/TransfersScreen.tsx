import React, { useState } from 'react';
import { useStore } from '../../store';
import { api } from '../../api/bridge';
import { ProgressBar, Button } from '../../components/ui';
import type { TransferSnapshot } from '../../../shared/types';

const ACTIVE_STATUSES = new Set(['queued', 'awaiting-accept', 'active', 'paused', 'interrupted']);

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

function TransferRow({ t }: { t: TransferSnapshot }) {
  const [expanded, setExpanded] = useState(false);
  const fraction = t.totalBytes ? t.bytesDone / t.totalBytes : 0;
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-2 text-xs">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <span>{t.direction === 'send' ? '⬆' : '⬇'}</span>
        <span className="font-semibold">{t.deviceName}</span>
        <span className="text-neutral-500">{t.fileCount} file(s) · {formatBytes(t.totalBytes)}</span>
        <span className="ml-auto capitalize">{t.status}</span>
      </div>
      <div className="mt-1"><ProgressBar fraction={fraction} /></div>
      <div className="flex gap-2 mt-1">
        {t.status === 'active' && <Button variant="ghost" onClick={() => api.core.pauseTransfer(t.id)}>Pause</Button>}
        {(t.status === 'paused' || t.status === 'interrupted') && (
          <Button variant="ghost" onClick={() => api.core.resumeTransfer(t.id)}>Resume</Button>
        )}
        {t.status === 'failed' && <Button variant="ghost" onClick={() => api.core.retryTransfer(t.id)}>Retry</Button>}
        {ACTIVE_STATUSES.has(t.status) && <Button variant="ghost" onClick={() => api.core.cancelTransfer(t.id)}>Cancel</Button>}
        {!ACTIVE_STATUSES.has(t.status) && <Button variant="ghost" onClick={() => api.core.discardTransfer(t.id)}>Dismiss</Button>}
      </div>
      {expanded && (
        <div className="mt-2 border-t border-neutral-200 dark:border-neutral-700 pt-2 space-y-1">
          {t.files.map((f) => (
            <div key={f.item.index} className="flex justify-between">
              <span className="truncate">{f.item.relPath}</span>
              <span className={f.status === 'failed' ? 'text-red-500' : ''}>{f.status}{f.reason ? ` (${f.reason})` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TransfersScreen() {
  const transfers = useStore((s) => s.transfers);
  const active = transfers.filter((t) => ACTIVE_STATUSES.has(t.status));
  const history = transfers.filter((t) => !ACTIVE_STATUSES.has(t.status));

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-2">Active ({active.length})</h3>
        <div className="space-y-2">
          {active.length === 0 && <div className="text-xs text-neutral-500">No active transfers</div>}
          {active.map((t) => <TransferRow key={t.id} t={t} />)}
        </div>
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">History</h3>
        <div className="space-y-2">
          {history.length === 0 && <div className="text-xs text-neutral-500">No completed transfers yet</div>}
          {history.map((t) => <TransferRow key={t.id} t={t} />)}
        </div>
      </section>
    </div>
  );
}
