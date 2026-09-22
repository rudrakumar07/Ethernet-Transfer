import React from 'react';
import { api } from '../../api/bridge';
import type { TransferSnapshot } from '../../../shared/types';
import { Button, CloseIcon, FolderIcon, IconButton, PauseIcon, PlayIcon, RetryIcon } from '../../components/ui';

/** Statuses a transfer can still move out of by itself. */
export const ACTIVE_STATUSES = new Set(['scanning', 'queued', 'awaiting-accept', 'active', 'paused', 'interrupted']);

/**
 * A command against the core. When the core is down the call rejects; the
 * reconnect banner already says so, so the rejection is swallowed rather than
 * surfacing as an unhandled error.
 */
function run(call: () => Promise<unknown>) {
  void call().catch(() => undefined);
}

interface Action {
  key: string;
  label: string;
  icon: React.ReactNode;
  variant: 'standard' | 'subtle' | 'danger';
  onClick: () => void;
}

/**
 * Which actions a transfer offers, by status. Shared by the Home card and the
 * Transfers screen so the two can never disagree.
 */
export function actionsFor(t: TransferSnapshot): Action[] {
  const pause: Action = { key: 'pause', label: 'Pause', icon: <PauseIcon size={12} />, variant: 'standard', onClick: () => run(() => api.core.pauseTransfer(t.id)) };
  const resume: Action = { key: 'resume', label: 'Resume', icon: <PlayIcon size={12} />, variant: 'standard', onClick: () => run(() => api.core.resumeTransfer(t.id)) };
  const cancel: Action = { key: 'cancel', label: 'Cancel', icon: <CloseIcon size={12} />, variant: 'danger', onClick: () => run(() => api.core.cancelTransfer(t.id)) };
  const retry: Action = { key: 'retry', label: 'Retry', icon: <RetryIcon size={13} />, variant: 'standard', onClick: () => run(() => api.core.retryTransfer(t.id)) };
  const dismiss: Action = { key: 'dismiss', label: 'Dismiss', icon: <CloseIcon size={12} />, variant: 'subtle', onClick: () => run(() => api.core.discardTransfer(t.id)) };
  const openFolder: Action = { key: 'open', label: 'Open folder', icon: <FolderIcon size={14} />, variant: 'subtle', onClick: () => run(() => api.main.openDownloadFolder()) };

  switch (t.status) {
    case 'active':
      return [pause, cancel];
    case 'paused':
    case 'interrupted':
      return [resume, cancel];
    case 'scanning':
    case 'queued':
    case 'awaiting-accept':
      return [cancel];
    case 'failed':
      // Only an outbound transfer can be retried from this side.
      return t.direction === 'send' ? [retry, dismiss] : [dismiss];
    case 'completed':
    case 'completed-with-errors':
      return t.direction === 'receive' ? [openFolder, dismiss] : [dismiss];
    default:
      return [dismiss];
  }
}

export function TransferActions({ t, compact }: { t: TransferSnapshot; compact?: boolean }) {
  const actions = actionsFor(t);
  return (
    <div className="flex items-center gap-1 shrink-0">
      {actions.map((a) =>
        compact ? (
          <IconButton key={a.key} label={a.label} variant={a.variant === 'danger' ? 'danger' : 'standard'} onClick={a.onClick}>
            {a.icon}
          </IconButton>
        ) : (
          <Button key={a.key} variant={a.variant} icon={a.icon} onClick={a.onClick}>
            {a.label}
          </Button>
        ),
      )}
    </div>
  );
}
