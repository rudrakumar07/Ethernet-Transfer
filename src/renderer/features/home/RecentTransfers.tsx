import React from 'react';
import type { TransferSnapshot } from '../../../shared/types';
import { Button, Card, CheckCircleIcon, EmptyState, ErrorIcon, FileIcon, FolderIcon, ProgressBar, StatusText, TransfersIcon } from '../../components/ui';
import { formatBytes, formatEta, formatSpeed, transferTitle } from '../../lib/format';
import { ACTIVE_STATUSES, TransferActions } from '../transfers/TransferActions';

/** Kept to two so Home fits the default window without scrolling. */
const SHOWN = 2;

function glyph(t: TransferSnapshot) {
  if (t.status === 'completed') return <CheckCircleIcon size={20} className="text-success" />;
  if (t.status === 'failed' || t.status === 'declined') return <ErrorIcon size={20} className="text-critical" />;
  return t.fileCount > 1 ? <FolderIcon size={20} className="text-accent-text" /> : <FileIcon size={20} className="text-accent-text" />;
}

function detail(t: TransferSnapshot): string {
  if (t.status === 'scanning') return `Scanning · ${t.fileCount.toLocaleString()} file(s), ${formatBytes(t.totalBytes)} so far`;
  if (t.status === 'active') {
    const eta = formatEta(t.etaSeconds);
    return [`${formatBytes(t.bytesDone)} of ${formatBytes(t.totalBytes)}`, t.speedBps > 0 ? formatSpeed(t.speedBps) : null, eta]
      .filter(Boolean)
      .join(' · ');
  }
  return `${formatBytes(t.totalBytes)} · ${t.fileCount.toLocaleString()} file(s)`;
}

function Row({ t }: { t: TransferSnapshot }) {
  const running = t.status === 'active' || t.status === 'scanning' || t.status === 'paused' || t.status === 'interrupted';
  const fraction = t.totalBytes ? t.bytesDone / t.totalBytes : 0;
  return (
    <li className="flex gap-3 items-start">
      <span className="mt-0.5">{glyph(t)}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold text-fg truncate">
            {transferTitle(t)}
            <span className="font-normal text-fg-2"> {t.direction === 'send' ? 'to' : 'from'} {t.deviceName}</span>
          </span>
          {t.status === 'active' ? (
            <span className="text-[12px] text-fg-2 tabular-nums shrink-0">{Math.round(fraction * 100)}%</span>
          ) : (
            <StatusText status={t.status} />
          )}
        </div>
        {running && (
          <div className="my-1.5">
            <ProgressBar
              fraction={fraction}
              indeterminate={t.status === 'scanning'}
              tone={t.status === 'interrupted' ? 'caution' : 'accent'}
              label={`${transferTitle(t)} progress`}
            />
          </div>
        )}
        <div className="text-[12px] text-fg-2 truncate">{detail(t)}</div>
      </div>
      <TransferActions t={t} compact />
    </li>
  );
}

export function RecentTransfers({ transfers, onOpenTransfers }: {
  transfers: TransferSnapshot[];
  onOpenTransfers: () => void;
}) {
  // In-flight work first, then the newest finished ones.
  const active = transfers.filter((t) => ACTIVE_STATUSES.has(t.status));
  const finished = transfers.filter((t) => !ACTIVE_STATUSES.has(t.status)).sort((a, b) => b.updatedAt - a.updatedAt);
  const shown = [...active, ...finished].slice(0, SHOWN);
  const more = transfers.length - shown.length;

  return (
    <Card
      title="Transfers"
      className="shrink-0"
      actions={
        <Button variant="subtle" onClick={onOpenTransfers} className="!h-7 !px-2 text-accent-text">
          View all{more > 0 ? ` (${transfers.length})` : ''}
        </Button>
      }
    >
      {shown.length === 0 ? (
        <EmptyState icon={<TransfersIcon size={24} />} title="No transfers yet" hint="Send something to a device and it shows up here." />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((t, i) => (
            <React.Fragment key={t.id}>
              {i > 0 && <li aria-hidden="true" className="h-px bg-stroke-divider" />}
              <Row t={t} />
            </React.Fragment>
          ))}
        </ul>
      )}
    </Card>
  );
}
