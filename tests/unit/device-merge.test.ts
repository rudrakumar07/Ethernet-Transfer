import { describe, it, expect } from 'vitest';
import { mergeSighting, type Sighting } from '../../src/core/discovery/logic/device-merge';
import type { Device } from '../../src/shared/types';

function sighting(over: Partial<Sighting> = {}): Sighting {
  return {
    deviceId: 'dev-1',
    name: 'Laptop',
    os: 'windows',
    fingerprint: 'abc123',
    port: 47800,
    address: { address: '192.168.1.5', family: 'IPv4', iface: 'eth0', linkType: 'wired' },
    ...over,
  };
}

describe('mergeSighting', () => {
  it('creates a new device on first sighting', () => {
    const devices = new Map<string, Device>();
    const device = mergeSighting(devices, sighting(), 1000, (fp) => fp.toUpperCase(), () => false);
    expect(device.id).toBe('dev-1');
    expect(device.linkType).toBe('wired');
    expect(devices.get('dev-1')).toBe(device);
  });

  it('accumulates a second address from a different interface', () => {
    const devices = new Map<string, Device>();
    mergeSighting(devices, sighting(), 1000, (fp) => fp, () => false);
    const second = mergeSighting(
      devices,
      sighting({ address: { address: '169.254.1.1', family: 'IPv4', iface: 'eth1', linkType: 'direct' } }),
      1100,
      (fp) => fp,
      () => false,
    );
    expect(second.addresses).toHaveLength(2);
    expect(second.linkType).toBe('direct'); // best of wired+direct is direct
  });

  it('replaces a stale address from the same interface rather than duplicating it', () => {
    const devices = new Map<string, Device>();
    mergeSighting(devices, sighting(), 1000, (fp) => fp, () => false);
    const updated = mergeSighting(devices, sighting(), 2000, (fp) => fp, () => false);
    expect(updated.addresses).toHaveLength(1);
    expect(updated.lastSeen).toBe(2000);
  });

  it('marks the device trusted when the trust lookup says so', () => {
    const devices = new Map<string, Device>();
    const device = mergeSighting(devices, sighting(), 1000, (fp) => fp, (fp) => fp === 'abc123');
    expect(device.trusted).toBe(true);
  });

  it('keeps manual=true once set, even after a beacon sighting updates it', () => {
    const devices = new Map<string, Device>();
    devices.set('dev-1', { ...mergeSighting(new Map(), sighting(), 1000, (fp) => fp, () => false), manual: true });
    const updated = mergeSighting(devices, sighting(), 2000, (fp) => fp, () => false);
    expect(updated.manual).toBe(true);
  });
});
