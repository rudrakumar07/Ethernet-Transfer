import os from 'node:os';
import si from 'systeminformation';
import type { InterfaceProvider, NetworkInterfaceInfo } from '../../ports';

function isLinkLocal(address: string, family: 'IPv4' | 'IPv6'): boolean {
  if (family === 'IPv4') return address.startsWith('169.254.');
  return address.toLowerCase().startsWith('fe80:');
}

export function createNodeInterfaceProvider(): InterfaceProvider {
  return {
    async list(): Promise<NetworkInterfaceInfo[]> {
      const nics = os.networkInterfaces();
      let wirelessNames = new Set<string>();
      try {
        const ifaces = await si.networkInterfaces();
        const arr = Array.isArray(ifaces) ? ifaces : [ifaces];
        wirelessNames = new Set(
          arr.filter((i) => i.type === 'wireless').map((i) => i.iface),
        );
      } catch {
        // systeminformation can fail in sandboxed/CI environments; fall back to "wired".
      }

      const result: NetworkInterfaceInfo[] = [];
      for (const [name, addrs] of Object.entries(nics)) {
        if (!addrs) continue;
        const addresses = addrs
          .filter((a) => !a.internal)
          .map((a) => ({
            address: a.address,
            family: (a.family === 'IPv4' ? 'IPv4' : 'IPv6') as 'IPv4' | 'IPv6',
            internal: a.internal,
          }));
        if (addresses.length === 0) continue;
        const hasRoutableAddress = addresses.some((a) => !isLinkLocal(a.address, a.family));
        result.push({
          name,
          addresses,
          wireless: wirelessNames.has(name),
          hasRoutableAddress,
        });
      }
      return result;
    },
  };
}
