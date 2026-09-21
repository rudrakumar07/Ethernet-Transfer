import os from 'node:os';
import si from 'systeminformation';
import type { InterfaceProvider, NetworkInterfaceInfo, InterfaceAddress } from '../../ports';
import { broadcastAddress } from './broadcast';

function isLinkLocal(address: string, family: 'IPv4' | 'IPv6'): boolean {
  if (family === 'IPv4') return address.startsWith('169.254.');
  return address.toLowerCase().startsWith('fe80:');
}

/**
 * How long a wireless-vs-wired classification is reused before being refreshed.
 * systeminformation shells out to the OS and was measured at 1.1-1.7s per call
 * on Windows; the beacon loop calls list() every 2s, so doing that inline meant
 * beacons routinely slipped past the peer's 6s presence window and the device
 * vanished from the map mid-transfer. os.networkInterfaces() is a cheap
 * synchronous syscall, so addresses stay live while only the NIC *type* is
 * cached and refreshed in the background.
 */
const WIRELESS_CACHE_TTL_MS = 60_000;

export function createNodeInterfaceProvider(): InterfaceProvider {
  let wirelessNames = new Set<string>();
  let wirelessLoadedAt = 0;
  let refreshing: Promise<void> | null = null;

  function refreshWirelessNames(): Promise<void> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const ifaces = await si.networkInterfaces();
        const arr = Array.isArray(ifaces) ? ifaces : [ifaces];
        wirelessNames = new Set(arr.filter((i) => i.type === 'wireless').map((i) => i.iface));
        wirelessLoadedAt = Date.now();
      } catch {
        // systeminformation can fail in sandboxed/CI environments; fall back to
        // "wired" and try again after the TTL rather than retrying every beacon.
        wirelessLoadedAt = Date.now();
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  function enumerate(): NetworkInterfaceInfo[] {
    const result: NetworkInterfaceInfo[] = [];
    for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
      if (!addrs) continue;
      const addresses: InterfaceAddress[] = addrs
        .filter((a) => !a.internal)
        .map((a) => {
          const family = (a.family === 'IPv4' || (a.family as unknown as number) === 4 ? 'IPv4' : 'IPv6') as
            | 'IPv4'
            | 'IPv6';
          return {
            address: a.address,
            family,
            internal: a.internal,
            netmask: a.netmask,
            broadcast: family === 'IPv4' ? broadcastAddress(a.address, a.netmask) ?? undefined : undefined,
          };
        });
      if (addresses.length === 0) continue;
      result.push({
        name,
        addresses,
        wireless: wirelessNames.has(name),
        hasRoutableAddress: addresses.some((a) => !isLinkLocal(a.address, a.family)),
      });
    }
    return result;
  }

  return {
    async list(): Promise<NetworkInterfaceInfo[]> {
      const stale = Date.now() - wirelessLoadedAt > WIRELESS_CACHE_TTL_MS;
      if (wirelessLoadedAt === 0) {
        // First call only: pay the cost once so the very first beacon is
        // classified correctly.
        await refreshWirelessNames();
      } else if (stale) {
        void refreshWirelessNames();
      }
      return enumerate();
    },
  };
}
