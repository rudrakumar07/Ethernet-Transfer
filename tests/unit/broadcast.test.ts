import { describe, it, expect } from 'vitest';
import { broadcastAddress } from '../../src/core/adapters/node/broadcast';

describe('broadcastAddress', () => {
  it('computes the directed broadcast for a /24', () => {
    expect(broadcastAddress('192.168.1.42', '255.255.255.0')).toBe('192.168.1.255');
  });

  it('computes the directed broadcast for a /21', () => {
    expect(broadcastAddress('172.23.20.169', '255.255.248.0')).toBe('172.23.23.255');
  });

  it('computes the /16 link-local broadcast used by a direct cable', () => {
    expect(broadcastAddress('169.254.10.5', '255.255.0.0')).toBe('169.254.255.255');
  });

  it('returns null for IPv6 or malformed input', () => {
    expect(broadcastAddress('fe80::1', 'ffff::')).toBeNull();
    expect(broadcastAddress('not-an-ip', '255.255.255.0')).toBeNull();
    expect(broadcastAddress('192.168.1.1', '')).toBeNull();
  });
});
