import React, { useState } from 'react';
import { useStore } from '../../store';
import type { TransferSnapshot } from '../../../shared/types';
import {
  Card,
  CheckCircleIcon,
  ChevronIcon,
  EmptyState,
  ErrorIcon,
  FileIcon,
  FolderIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PageHeader,
  ProgressBar,
  StatusText,
  TransfersIcon,
} from '../../components/ui';
import { formatBytes, formatEta, formatSpeed, transferTitle } from '../../lib/format';
import { ACTIVE_STATUSES, TransferActions } from './TransferActions';

/** Cap on per-file rows drawn in an expanded transfer. */
const FILE_ROWS_SHOWN = 200;

function glyph(t: TransferSnapshot) {
  if (t.status === 'completed') return <CheckCircleIcon size={20} className="text-success" />;
  if (t.status === 'failed' || t.status === 'declined') return <ErrorIcon size={20} className="text-critical" />;
  return t.fileCount > 1 ? <FolderIcon size={20} className="text-accent-text" /> : <FileIcon size={20} className="text-accent-text" />;
}

function TransferRow({ t }: { t: TransferSnapshot }) {
  const [expanded, setExpanded] = useState(false);
  const scanning = t.status === 'scanning';
  const running = scanning || t.status === 'active' || t.status === 'paused' || t.status === 'interrupted';
  const fraction = t.totalBytes ? t.bytesDone / t.totalBytes : 0;
  const eta = t.status === 'active' ? formatEta(t.etaSeconds) : null;
  const failedCount = t.files.filter((f) => f.status === 'failed').length;
  const title = transferTitle(t);

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5">{glyph(t)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[14px] font-semibold text-fg truncate">{title}</span>
            <StatusText status={t.status} />
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-fg-2 mt-0.5">
            {t.direction === 'send' ? <ArrowUpIcon size={11} /> : <ArrowDownIcon size={11} />}
            <span className="truncate">
              {t.direction === 'send' ? 'To' : 'From'} {t.deviceName} · {t.fileCount.toLocaleString()} file(s) ·{' '}
              {formatBytes(t.totalBytes)}
            </span>
          </div>

          {running && (
            <div className="mt-2.5">
              <ProgressBar
                fraction={fraction}
                indeterminate={scanning}
                tone={t.status === 'interrupted' ? 'caution' : 'accent'}
                label={`${title} progress`}
              />
            </div>
          )}

          {!scanning && (
            <div className="flex flex-wrap items-center gap-x-1.5 mt-1.5 text-[12px] text-fg-2 tabular-nums">
              <span>{formatBytes(t.bytesDone)} of {formatBytes(t.totalBytes)}</span>
              {t.status === 'active' && t.speedBps > 0 && <span>· {formatSpeed(t.speedBps)}</span>}
              {eta && <span>· {eta}</span>}
              {failedCount > 0 && <span className="text-critical">· {failedCount.toLocaleString()} failed</span>}
            </div>
          )}
          {scanning && (
            <div className="mt-1.5 text-[12px] text-fg-2">
              Scanning… {t.fileCount.toLocaleString()} file(s), {formatBytes(t.totalBytes)} so far
            </div>
          )}
          {t.error && <div className="mt-1.5 text-[12px] text-critical">{t.error}</div>}
        </div>

        <TransferActions t={t} />
        {t.files.length > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide files' : 'Show files'}
            title={expanded ? 'Hide files' : 'Show files'}
            onClick={() => setExpanded((v) => !v)}
            className="w-8 h-8 rounded-control flex items-center justify-center text-fg-2 hover:bg-subtle-hover shrink-0"
          >
            <ChevronIcon open={expanded} size={14} />
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 ml-8 max-h-72 overflow-y-auto rounded-control border border-stroke bg-layer divide-y divide-stroke-divider">
          {/* A folder can hold tens of thousands of files; rendering a row for
              every one of them would lock up the window. */}
          {t.files.slice(0, FILE_ROWS_SHOWN).map((f) => (
            <div key={f.item.index} className="flex justify-between gap-3 px-3 py-1.5 text-[12px]">
              <span className="truncate font-mono text-fg">{f.item.relPath}</span>
              <span className={`shrink-0 ${f.status === 'failed' ? 'text-critical' : 'text-fg-2'}`}>
                {f.status}
                {f.reason ? ` (${f.reason})` : ''}
              </span>
            </div>
          ))}
          {t.files.length > FILE_ROWS_SHOWN && (
            <div className="px-3 py-1.5 text-[12px] text-fg-2">
              …and {(t.files.length - FILE_ROWS_SHOWN).toLocaleString()} more file(s)
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function TransferList({ items }: { items: TransferSnapshot[] }) {
  return (
    <ul className="divide-y divide-stroke-divider -mx-4 -mb-4">
      {items.map((t) => (
        <TransferRow key={t.id} t={t} />
      ))}
    </ul>
  );
}

export function TransfersScreen() {
  const transfers = useStore((s) => s.transfers);
  const active = transfers.filter((t) => ACTIVE_STATUSES.has(t.status));
  const history = transfers
    .filter((t) => !ACTIVE_STATUSES.has(t.status))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="flex flex-col gap-5 px-8 py-7 max-w-5xl">
        <PageHeader
          title="Transfers"
          subtitle={active.length > 0 ? `${active.length} in progress` : 'Nothing in progress'}
        />

        <Card title={`Active (${active.length})`}>
          {active.length === 0 ? (
            <EmptyState
              icon={<TransfersIcon size={28} />}
              title="No transfers in progress"
              hint="Drag files onto a device on Home, or select a device and use Send files."
            />
          ) : (
            <TransferList items={active} />
          )}
        </Card>

        <Card title={`History (${history.length})`}>
          {history.length === 0 ? (
            <EmptyState icon={<CheckCircleIcon size={28} />} title="No finished transfers yet" />
          ) : (
            <TransferList items={history} />
          )}
        </Card>
      </div>
    </div>
  );
}
