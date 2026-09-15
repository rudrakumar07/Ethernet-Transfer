import type { TransferStatus } from '../../../shared/types';

/** Allowed transfer state transitions (spec §5.9). */
const ALLOWED: Record<TransferStatus, TransferStatus[]> = {
  queued: ['awaiting-accept', 'active', 'cancelled', 'failed'],
  'awaiting-accept': ['active', 'declined', 'cancelled'],
  active: ['paused', 'interrupted', 'completed', 'completed-with-errors', 'cancelled', 'failed'],
  paused: ['active', 'cancelled', 'interrupted'],
  interrupted: ['active', 'cancelled', 'paused'],
  completed: [],
  'completed-with-errors': [],
  declined: [],
  failed: ['queued'],
  cancelled: [],
};

export function canTransition(from: TransferStatus, to: TransferStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
