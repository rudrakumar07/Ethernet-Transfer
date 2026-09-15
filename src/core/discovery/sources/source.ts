import type { Sighting } from '../logic/device-merge';

/** A pluggable discovery mechanism. Adding a new one is one file (spec §12.4). */
export interface DiscoverySource {
  start(onSighting: (s: Sighting) => void): Promise<void>;
  stop(): Promise<void>;
}
