import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CertificateFactory, FileSystem, Platform } from '../ports';
import type { SettingsService } from '../settings';
import type { DeviceId } from '../../shared/types';

export interface Identity {
  deviceId: DeviceId;
  name: string;
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  certPem: string;
  keyPem: string;
  fingerprint: string;
  shortId: string;
}

export interface IdentityService {
  get(): Identity;
  refreshName(): void;
}

interface StoredIdentity {
  deviceId: string;
  certPem: string;
  keyPem: string;
  fingerprint: string;
}

export interface IdentityDeps {
  fs: FileSystem;
  platform: Platform;
  certificates: CertificateFactory;
  settings: SettingsService;
}

function toShortId(fingerprint: string): string {
  const hex = fingerprint.slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

export async function createIdentityService(deps: IdentityDeps): Promise<IdentityService> {
  const { fs, platform, certificates, settings } = deps;
  const filePath = path.join(platform.dataDir(), 'identity', 'device.json');

  let stored = await fs.readJson<StoredIdentity>(filePath);
  if (!stored) {
    const deviceId = randomUUID();
    const { certPem, keyPem, fingerprint } = await certificates.createSelfSigned(deviceId);
    stored = { deviceId, certPem, keyPem, fingerprint };
    await fs.writeJsonAtomic(filePath, stored);
  }

  const snapshot = stored;
  let identity: Identity = {
    deviceId: snapshot.deviceId,
    name: settings.get().deviceName,
    os: platform.osName(),
    certPem: snapshot.certPem,
    keyPem: snapshot.keyPem,
    fingerprint: snapshot.fingerprint,
    shortId: toShortId(snapshot.fingerprint),
  };

  settings.events.on('changed', (s) => {
    identity = { ...identity, name: s.deviceName };
  });

  return {
    get: () => identity,
    refreshName: () => {
      identity = { ...identity, name: settings.get().deviceName };
    },
  };
}
