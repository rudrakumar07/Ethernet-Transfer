import type { TransferItem } from '../../../shared/types';

export type ResumeAction =
  | { kind: 'resume'; index: number; offset: number }
  | { kind: 'restart'; index: number; size: number; mtimeMs: number }
  | { kind: 'missing'; index: number };

export interface SourceCheck {
  exists: boolean;
  size: number;
  mtimeMs: number;
}

/**
 * Decide, per file, whether to resume from the receiver's reported offset,
 * restart from zero (source changed), or fail (source missing). Spec §5.7.
 */
export function planResume(
  items: TransferItem[],
  receiverOffsets: Record<number, number>,
  sourceCheck: (item: TransferItem) => SourceCheck,
): ResumeAction[] {
  return items
    .filter((item) => item.kind === 'file')
    .map((item) => {
      const check = sourceCheck(item);
      if (!check.exists) return { kind: 'missing', index: item.index };
      const offset = receiverOffsets[item.index] ?? 0;
      const unchanged = check.size === item.size && check.mtimeMs === item.mtimeMs;
      if (unchanged) return { kind: 'resume', index: item.index, offset };
      return { kind: 'restart', index: item.index, size: check.size, mtimeMs: check.mtimeMs };
    });
}
