import React, { useState } from 'react';
import { useStore } from '../../store';
import { api } from '../../api/bridge';
import { Button, EmptyState, PageHeader, ProgressBar, StatusPill } from '../../components/ui';
import type { TransferSnapshot } from '../../../shared/types';

const ACTIVE_STATUSES = new Set(['scanning', 'queued', 'awaiting-accept', 'active', 'paused', 'interrupted']);

/** Cap on per-file rows drawn in an expanded transfer. */
const FILE_ROWS_SHOWN = 200;

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

function formatEta(seconds: number | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  if (seconds < 60) return `${Math.round(seconds)}s left`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min left`;
  return `${(seconds / 3600).toFixed(1)} h left`;
}

function TransferRow({ t }: { t: TransferSnapshot }) {
  const [expanded, setExpanded] = useState(false);
  const scanning = t.status === 'scanning';
  const fraction = t.totalBytes ? t.bytesDone / t.totalBytes : 0;
  const inFlight = t.status === 'active';
  const eta = inFlight ? formatEta(t.etaSeconds) : null;
  const failedCount = t.files.filter((f) => f.status === 'failed').length;

  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 p-3 text-xs">
      <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <span className="text-sm opacity-70" aria-hidden>{t.direction === 'send' ? '↑' : '↓'}</span>
        <span className="font-semibold text-sm truncate">{t.deviceName}</span>
        <span className="text-neutral-500 truncate">
          {scanning
            ? `Scanning… ${t.fileCount.toLocaleString()} file(s), ${formatBytes(t.totalBytes)} so far`
            : `${t.fileCount.toLocaleString()} file(s) · ${formatBytes(t.totalBytes)}`}
        </span>
        <span className="ml-auto flex items-center gap-2 shrink-0">
          <StatusPill status={t.status} />
          <span className="text-neutral-400" aria-hidden>{expanded ? '▾' : '▸'}</span>
        </span>
      </div>

      {t.error && <div className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{t.error}</div>}

      <div className="mt-2">
        <ProgressBar fraction={fraction} indeterminate={scanning} />
      </div>

      {!scanning && (
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-neutral-500">
          <span>{formatBytes(t.bytesDone)} of {formatBytes(t.totalBytes)}</span>
          {inFlight && t.speedBps > 0 && <span>· {(t.speedBps / 1e6).toFixed(1)} MB/s</span>}
          {eta && <span>· {eta}</span>}
          {failedCount > 0 && (
            <span className="text-red-500">· {failedCount.toLocaleString()} failed</span>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-2.5">
        {t.status === 'active' && <Button variant="ghost" onClick={() => api.core.pauseTransfer(t.id)}>Pause</Button>}
        {(t.status === 'paused' || t.status === 'interrupted') && (
          <Button variant="ghost" onClick={() => api.core.resumeTransfer(t.id)}>Resume</Button>
        )}
        {t.status === 'failed' && <Button variant="ghost" onClick={() => api.core.retryTransfer(t.id)}>Retry</Button>}
        {ACTIVE_STATUSES.has(t.status) && (
          <Button variant="danger" onClick={() => api.core.cancelTransfer(t.id)}>Cancel</Button>
        )}
        {!ACTIVE_STATUSES.has(t.status) && (
          <Button variant="ghost" onClick={() => api.core.discardTransfer(t.id)}>Dismiss</Button>
        )}
      </div>

      {expanded && (
        <div className="mt-2.5 border-t border-neutral-200 dark:border-neutral-800 pt-2 space-y-1">
          {/* A folder can hold tens of thousands of files; rendering a row for
              every one of them would lock up the window. */}
          {t.files.slice(0, FILE_ROWS_SHOWN).map((f) => (
            <div key={f.item.index} className="flex justify-between gap-3">
              <span className="truncate font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                {f.item.relPath}
              </span>
              <span className={`shrink-0 ${f.status === 'failed' ? 'text-red-500' : 'text-neutral-500'}`}>
                {f.status}{f.reason ? ` (${f.reason})` : ''}
              </span>
            </div>
          ))}
          {t.files.length > FILE_ROWS_SHOWN && (
            <div className="text-neutral-500 pt-1">
              …and {(t.files.length - FILE_ROWS_SHOWN).toLocaleString()} more file(s)
            </div>
          )}
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
    <div className="flex-1 overflow-y-auto p-5">
      <PageHeader
        title="Transfers"
        subtitle={active.length > 0 ? `${active.length} in progress` : 'Nothing in progress'}
      />

      <div className="space-y-6 max-w-3xl">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">
            Active ({active.length})
          </h3>
          {active.length === 0 ? (
            <EmptyState
              icon="⇅"
              title="No transfers in progress"
              hint="Drag files onto a device on the Home screen, or use Send files on a selected device."
            />
          ) : (
            <div className="space-y-2">
              {active.map((t) => <TransferRow key={t.id} t={t} />)}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">
            History ({history.length})
          </h3>
          {history.length === 0 ? (
            <EmptyState icon="🗂" title="No completed transfers yet" />
          ) : (
            <div className="space-y-2">
              {history.map((t) => <TransferRow key={t.id} t={t} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
