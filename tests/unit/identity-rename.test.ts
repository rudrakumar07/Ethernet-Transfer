import { describe, it, expect } from 'vitest';
import { createIdentityService } from '../../src/core/identity';
import { createSettingsService } from '../../src/core/settings';
import { createMdnsSource } from '../../src/core/discovery/sources/mdns-source';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createFakePlatform } from '../fakes/platform';
import type { CertificateFactory, MdnsProvider } from '../../src/core/ports';

const certificates: CertificateFactory = {
  createSelfSigned: async () => ({ certPem: 'cert', keyPem: 'key', fingerprint: 'abcdef0123456789' }),
  fingerprintOf: async () => 'abcdef0123456789',
};

/**
 * Regression coverage: renaming the device in Settings never reached other
 * machines. The core took the identity object once and handed it to
 * discovery and the transfer service; a rename replaced the identity
 * service's own copy with a new object, so beacons and handshakes kept the
 * old name until a restart.
 */
describe('renaming this device', () => {
  it('updates the identity object every module already holds', async () => {
    const fs = createFakeFileSystem();
    const platform = createFakePlatform({ hostname: 'old-name' });
    const settings = await createSettingsService({ fs, platform });
    const identityService = await createIdentityService({ fs, platform, certificates, settings });

    const heldByDiscovery = identityService.get();
    await settings.update({ deviceName: 'new-name' });

    expect(heldByDiscovery.name).toBe('new-name');
    expect(identityService.get()).toBe(heldByDiscovery);
  });

  it('re-advertises over mDNS under the new name', async () => {
    const advertised: string[] = [];
    const mdns: MdnsProvider = {
      advertise: ({ txt }) => advertised.push(txt.name),
      browse: () => {},
      stop: () => {},
    };
    const identity = { deviceId: 'me', name: 'old-name', os: 'linux' as const, certPem: '', keyPem: '', fingerprint: 'fp', shortId: 'AAAA' };
    const source = createMdnsSource({
      mdns,
      interfaces: { list: async () => [] },
      identity,
      transferPort: () => 47800,
    });

    await source.start(() => {});
    identity.name = 'new-name';
    await source.refresh?.();

    expect(advertised).toEqual(['old-name', 'new-name']);
  });
});
