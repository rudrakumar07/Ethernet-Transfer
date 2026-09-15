import type { LinkType } from '../../../shared/types';
import type { NetworkInterfaceInfo } from '../../ports';

/**
 * Classify a link by the LOCAL interface a sighting arrived on (spec §4.2).
 * A direct cable is an interface with no routable address at all — every
 * interface has a link-local address, so that alone can't be used.
 */
export function classifyLinkType(iface: NetworkInterfaceInfo | undefined): LinkType {
  if (!iface) return 'wired';
  if (!iface.hasRoutableAddress) return 'direct';
  return iface.wireless ? 'wireless' : 'wired';
}

const LINK_PRIORITY: Record<LinkType, number> = { direct: 0, wired: 1, wireless: 2 };

/** Best (lowest-latency-preferred) link type among several, per spec §4.3. */
export function bestLinkType(types: LinkType[]): LinkType {
  return types.reduce((best, t) => (LINK_PRIORITY[t] < LINK_PRIORITY[best] ? t : best), 'wireless' as LinkType);
}

export function compareAddressPriority(a: LinkType, b: LinkType): number {
  return LINK_PRIORITY[a] - LINK_PRIORITY[b];
}
