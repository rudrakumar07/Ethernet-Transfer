export { createDiscoveryService } from './service';
export type { DiscoveryService, DiscoveryDeps, DiscoveryEvents } from './service';
export { classifyLinkType, bestLinkType, compareAddressPriority } from './logic/link-type';
export { isOnline, PRESENCE_TIMEOUT_MS } from './logic/presence';
