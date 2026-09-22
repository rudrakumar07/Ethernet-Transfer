import type { InterfaceProvider, MdnsProvider } from '../../ports';
import type { Identity } from '../../identity';
import type { DiscoverySource } from './source';
import type { Sighting } from '../logic/device-merge';
import { classifyLinkType } from '../logic/link-type';

export interface MdnsSourceDeps {
  mdns: MdnsProvider;
  interfaces: InterfaceProvider;
  identity: Identity;
  transferPort: () => number;
}

export function createMdnsSource(deps: MdnsSourceDeps): DiscoverySource {
  const { mdns, interfaces, identity, transferPort } = deps;

  function advertise() {
    mdns.advertise({
      name: identity.name,
      port: transferPort(),
      txt: {
        id: identity.deviceId,
        name: identity.name,
        os: identity.os,
        fp: identity.fingerprint,
        ver: '1',
      },
    });
  }

  return {
    async refresh() {
      // A stale TXT record would keep answering queries with the old name,
      // so peers would flicker between it and the beacons' new one.
      advertise();
    },

    async start(onSighting) {
      advertise();

      const ifaces = await interfaces.list();
      mdns.browse((txt, address, port) => {
        if (!txt?.id || txt.id === identity.deviceId) return;
        const iface = ifaces.find((i) => i.addresses.some((a) => sameSubnetGuess(a.address, address)));
        const sighting: Sighting = {
          deviceId: txt.id,
          name: txt.name ?? txt.id,
          os: (txt.os as Sighting['os']) ?? 'unknown',
          fingerprint: txt.fp,
          port,
          address: {
            address,
            family: address.includes(':') ? 'IPv6' : 'IPv4',
            iface: iface?.name ?? 'unknown',
            linkType: classifyLinkType(iface),
          },
        };
        onSighting(sighting);
      });
    },

    async stop() {
      mdns.stop();
    },
  };
}

// Best-effort heuristic to attribute an mDNS sighting to a local interface for
// link-type classification; beacons remain the authoritative source since they
// bind per-interface.
function sameSubnetGuess(local: string, remote: string): boolean {
  const a = local.split('.').slice(0, 3).join('.');
  const b = remote.split('.').slice(0, 3).join('.');
  return a === b;
}
