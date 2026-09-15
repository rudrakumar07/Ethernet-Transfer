import { describe, it, expect } from 'vitest';
import { classifyLinkType, bestLinkType, compareAddressPriority } from '../../src/core/discovery/logic/link-type';
import type { NetworkInterfaceInfo } from '../../src/core/ports';

function iface(over: Partial<NetworkInterfaceInfo>): NetworkInterfaceInfo {
  return { name: 'eth0', addresses: [], wireless: false, hasRoutableAddress: true, ...over };
}

describe('classifyLinkType', () => {
  it('classifies an interface with no routable address as direct cable', () => {
    expect(classifyLinkType(iface({ hasRoutableAddress: false }))).toBe('direct');
  });

  it('classifies a routable wired interface as wired', () => {
    expect(classifyLinkType(iface({ hasRoutableAddress: true, wireless: false }))).toBe('wired');
  });

  it('classifies a routable wireless interface as wireless', () => {
    expect(classifyLinkType(iface({ hasRoutableAddress: true, wireless: true }))).toBe('wireless');
  });

  it('does NOT treat every interface as direct just because it has a link-local address', () => {
    // Regression test for the bug caught during build: every interface has an
    // fe80:: address, so link-local presence alone must never imply "direct".
    const normalLan = iface({ hasRoutableAddress: true, wireless: false });
    expect(classifyLinkType(normalLan)).not.toBe('direct');
  });

  it('defaults to wired when no interface info is available', () => {
    expect(classifyLinkType(undefined)).toBe('wired');
  });
});

describe('bestLinkType', () => {
  it('prefers direct over wired and wireless', () => {
    expect(bestLinkType(['wireless', 'wired', 'direct'])).toBe('direct');
  });

  it('prefers wired over wireless when no direct link exists', () => {
    expect(bestLinkType(['wireless', 'wired'])).toBe('wired');
  });

  it('falls back to wireless when that is all there is', () => {
    expect(bestLinkType(['wireless'])).toBe('wireless');
  });
});

describe('compareAddressPriority', () => {
  it('orders direct before wired before wireless', () => {
    const list = ['wireless', 'direct', 'wired'] as const;
    const sorted = [...list].sort(compareAddressPriority);
    expect(sorted).toEqual(['direct', 'wired', 'wireless']);
  });
});
