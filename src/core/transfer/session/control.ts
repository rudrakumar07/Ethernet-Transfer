export type SessionAbortReason = 'pause' | 'cancel';

export interface SessionControl {
  /** True once pause or cancel has been requested; sessions should stop sending/accepting data. */
  isAborted(): boolean;
  reason(): SessionAbortReason | null;
  requestPause(): void;
  requestCancel(): void;
  /** Registers a callback fired exactly once, the first time either is requested. */
  onAbort(cb: (reason: SessionAbortReason) => void): void;
}

/**
 * A tiny cooperative abort signal shared between a running sender/receiver
 * session and the outside world (transfer/service.ts), so a user clicking
 * Pause or Cancel actually stops the local side's byte flow instead of only
 * changing a status label.
 */
export function createSessionControl(): SessionControl {
  let abortReason: SessionAbortReason | null = null;
  const listeners: ((reason: SessionAbortReason) => void)[] = [];

  function trigger(reason: SessionAbortReason) {
    if (abortReason) return; // first request wins; cancel and pause are mutually exclusive
    abortReason = reason;
    for (const cb of listeners.splice(0)) cb(reason);
  }

  return {
    isAborted: () => abortReason !== null,
    reason: () => abortReason,
    requestPause: () => trigger('pause'),
    requestCancel: () => trigger('cancel'),
    onAbort(cb) {
      if (abortReason) cb(abortReason);
      else listeners.push(cb);
    },
  };
}
