import { describe, it, expect } from 'vitest';
import { createDiscoveryService } from '../../src/core/discovery';
import { createTrustService } from '../../src/core/trust';
import { createSettingsService } from '../../src/core/settings';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createFakePlatform } from '../fakes/platform';
import { createFakeClock } from '../fakes/clock';
import { createSilentLogger } from '../fakes/logger';
import type { UdpMessage, UdpTransport } from '../../src/core/ports';

/**
 * Regression coverage for the trust switch appearing to ignore clicks: a
 * device's `trusted` flag was stamped on only when a beacon was merged, so
 * after trusting or untrusting it the record - and the switch bound to it -
 * stayed wrong until the next beacon, up to two seconds later.
 */
describe('trusting a discovered device', () => {
  it('updates the device record and announces it immediately', async () => {
    const fs = createFakeFileSystem();
    const platform = createFakePlatform();
    const trust = await createTrustService({ fs, platform });
    const settings = await createSettingsService({ fs, platform });

    let deliver: ((m: UdpMessage) => void) | undefined;
    const udp: UdpTransport = {
      bind: async ({ onMessage }) => {
        deliver = onMessage;
        return { close: () => {} };
      },
      send: async () => {},
    };

    const discovery = createDiscoveryService({
      udp,
      mdns: { advertise: () => {}, browse: () => {}, stop: () => {} },
      interfaces: {
        list: async () => [{
          name: 'eth0',
          addresses: [{ address: '10.0.0.5', family: 'IPv4', internal: false, netmask: '255.255.255.0', broadcast: '10.0.0.255' }],
          wireless: false,
          hasRoutableAddress: true,
        }],
      },
      clock: createFakeClock(),
      logger: createSilentLogger(),
      identity: { deviceId: 'me', name: 'Me', os: 'linux', certPem: '', keyPem: '', fingerprint: 'my-fp', shortId: 'ME00' },
      trust,
      settings,
      transferPort: () => 47800,
    });
    await discovery.start();

    deliver!({
      data: Buffer.from(JSON.stringify({ v: 1, id: 'peer', name: 'Peer', os: 'linux', port: 47800, fp: 'peer-fp' })),
      address: '10.0.0.9',
      port: 47801,
      iface: 'eth0',
    });
    expect(discovery.getDevice('peer')?.trusted).toBe(false);

    const updates: boolean[] = [];
    discovery.events.on('deviceUpdated', (d) => updates.push(d.trusted));

    await trust.trust({ fingerprint: 'peer-fp', deviceId: 'peer', name: 'Peer' });
    discovery.refreshTrust();
    expect(discovery.getDevice('peer')?.trusted).toBe(true);

    await trust.untrust('peer-fp');
    discovery.refreshTrust();
    expect(discovery.getDevice('peer')?.trusted).toBe(false);

    expect(updates).toEqual([true, false]);
    await discovery.stop();
  });
});
