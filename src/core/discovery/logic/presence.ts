/**
 * A device counts as online while heard from within this window (spec §4.1).
 *
 * Beacons go out every 2s, so this tolerates six consecutive misses. The old
 * 6s window allowed only two, and a single slow interface enumeration was
 * enough to blow through it and make a device vanish from the map mid-transfer.
 */
export const PRESENCE_TIMEOUT_MS = 12_000;

export function isOnline(lastSeen: number, now: number): boolean {
  return now - lastSeen <= PRESENCE_TIMEOUT_MS;
}
