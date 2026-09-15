import path from 'node:path';
import type { FileSystem, Platform } from '../ports';
import type { DeviceId, TrustedDeviceRecord } from '../../shared/types';

export type IdentityCheckResult = 'ok' | 'unknown' | 'changed';

export interface TrustService {
  isTrusted(fingerprint: string): boolean;
  trust(record: { fingerprint: string; deviceId: DeviceId; name: string }): Promise<void>;
  untrust(fingerprint: string): Promise<void>;
  checkIdentity(deviceId: DeviceId, fingerprint: string): IdentityCheckResult;
  list(): TrustedDeviceRecord[];
}

export interface TrustDeps {
  fs: FileSystem;
  platform: Platform;
}

export async function createTrustService(deps: TrustDeps): Promise<TrustService> {
  const { fs, platform } = deps;
  const filePath = path.join(platform.dataDir(), 'trusted-devices.json');

  let records: TrustedDeviceRecord[] = (await fs.readJson<TrustedDeviceRecord[]>(filePath)) ?? [];

  async function persist() {
    await fs.writeJsonAtomic(filePath, records);
  }

  return {
    isTrusted: (fingerprint) => records.some((r) => r.fingerprint === fingerprint),

    async trust(record) {
      records = records.filter((r) => r.deviceId !== record.deviceId);
      records.push({ ...record, trustedAt: Date.now() });
      await persist();
    },

    async untrust(fingerprint) {
      records = records.filter((r) => r.fingerprint !== fingerprint);
      await persist();
    },

    checkIdentity(deviceId, fingerprint) {
      const existing = records.find((r) => r.deviceId === deviceId);
      if (!existing) return 'unknown';
      return existing.fingerprint === fingerprint ? 'ok' : 'changed';
    },

    list: () => records,
  };
}
