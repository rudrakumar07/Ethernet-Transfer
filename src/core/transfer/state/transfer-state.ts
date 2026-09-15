import path from 'node:path';
import type { FileSystem, Platform } from '../../ports';
import type { TransferDirection, TransferId, TransferItem, FileStatus } from '../../../shared/types';

export interface PersistedTransferState {
  id: TransferId;
  direction: TransferDirection;
  deviceId: string;
  deviceFingerprint: string;
  deviceName: string;
  destinationRoot?: string; // receiver only
  sourcePaths?: Record<number, string>; // sender only: index -> absolute path
  items: TransferItem[];
  fileStatus: Record<number, FileStatus>;
  bytesDone: Record<number, number>;
  createdAt: number;
  updatedAt: number;
}

export function transferStateDir(platform: Platform): string {
  return path.join(platform.dataDir(), 'transfers');
}

export function transferStatePath(platform: Platform, id: TransferId): string {
  return path.join(transferStateDir(platform), `${id}.json`);
}

export async function saveTransferState(
  fs: FileSystem,
  platform: Platform,
  state: PersistedTransferState,
): Promise<void> {
  await fs.writeJsonAtomic(transferStatePath(platform, state.id), state);
}

export async function loadTransferState(
  fs: FileSystem,
  platform: Platform,
  id: TransferId,
): Promise<PersistedTransferState | null> {
  return fs.readJson<PersistedTransferState>(transferStatePath(platform, id));
}

export async function deleteTransferState(
  fs: FileSystem,
  platform: Platform,
  id: TransferId,
): Promise<void> {
  await fs.rm(transferStatePath(platform, id));
}
