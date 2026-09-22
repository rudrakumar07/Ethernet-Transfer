import type { Sighting } from '../logic/device-merge';

/** A pluggable discovery mechanism. Adding a new one is one file (spec §12.4). */
export interface DiscoverySource {
  start(onSighting: (s: Sighting) => void): Promise<void>;
  stop(): Promise<void>;
  /**
   * This device's name changed. Sources that announce periodically (beacons)
   * pick it up on their own; one that announces once must re-announce.
   */
  refresh?(): Promise<void>;
}
