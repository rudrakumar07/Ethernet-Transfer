/** A device counts as online while heard from within this window (spec §4.1). */
export const PRESENCE_TIMEOUT_MS = 6_000;

export function isOnline(lastSeen: number, now: number): boolean {
  return now - lastSeen <= PRESENCE_TIMEOUT_MS;
}
