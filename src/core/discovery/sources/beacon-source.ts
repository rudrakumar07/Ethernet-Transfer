import type { Clock, InterfaceProvider, Logger, UdpTransport, NetworkInterfaceInfo } from '../../ports';
import type { Identity } from '../../identity';
import type { DiscoverySource } from './source';
import type { Sighting } from '../logic/device-merge';
import { classifyLinkType } from '../logic/link-type';

export const BEACON_PORT = 47801;
const MULTICAST_GROUP = '239.255.77.77';
const BEACON_INTERVAL_MS = 2000;
/** How often the interface list is re-read to pick up a cable being plugged in. */
const REBIND_INTERVAL_MS = 5000;

interface BeaconPayload {
  v: number;
  id: string;
  name: string;
  os: string;
  port: number;
  fp: string;
}

interface PingPayload {
  type: 'ping' | 'pong';
  from: string;
  nonce: string;
}

export interface BeaconSourceDeps {
  udp: UdpTransport;
  interfaces: InterfaceProvider;
  identity: Identity;
  clock: Clock;
  logger: Logger;
  transferPort: () => number;
  ignoredInterfaces: () => string[];
  /** Called when a ping/pong message (not a discovery beacon) arrives on the shared socket. */
  onPingPong?: (msg: PingPayload) => void;
}

interface BoundSocket {
  key: string;
  iface: NetworkInterfaceInfo;
  address: string;
  handle: { close(): void };
}

export function createBeaconSource(deps: BeaconSourceDeps): DiscoverySource {
  const { udp, interfaces, identity, clock, logger, transferPort, ignoredInterfaces, onPingPong } = deps;
  const bound = new Map<string, BoundSocket>();
  let beaconTimer: unknown;
  let rebindTimer: unknown;
  let stopped = false;

  function usableIpv4(iface: NetworkInterfaceInfo) {
    return iface.addresses.filter((a) => a.family === 'IPv4');
  }

  async function broadcastOnce() {
    const payload: BeaconPayload = {
      v: 1,
      id: identity.deviceId,
      name: identity.name,
      os: identity.os,
      port: transferPort(),
      fp: identity.fingerprint,
    };
    const data = Buffer.from(JSON.stringify(payload), 'utf8');

    // Send from every bound interface explicitly. Relying on the default route
    // meant beacons only ever left the interface with a gateway - so a direct
    // cable, which has no gateway at all, never carried one.
    for (const socket of bound.values()) {
      const addr = socket.iface.addresses.find((a) => a.address === socket.address);
      const targets: string[] = [MULTICAST_GROUP];
      if (addr?.broadcast) targets.push(addr.broadcast);
      for (const target of targets) {
        try {
          await udp.send({ data, address: target, port: BEACON_PORT, ifaceAddress: socket.address });
        } catch (err) {
          logger.debug('beacon send failed', { iface: socket.iface.name, target, err: String(err) });
        }
      }
    }
  }

  function handleMessage(
    iface: NetworkInterfaceInfo,
    msg: { data: Buffer; address: string; iface: string },
    onSighting: (s: Sighting) => void,
  ) {
    let parsed: BeaconPayload | PingPayload;
    try {
      parsed = JSON.parse(msg.data.toString('utf8'));
    } catch {
      return;
    }

    const asPing = parsed as Partial<PingPayload>;
    if (asPing.type === 'ping' || asPing.type === 'pong') {
      if (asPing.from === identity.deviceId) return;
      if (asPing.type === 'ping') {
        const reply = Buffer.from(
          JSON.stringify({ type: 'pong', from: identity.deviceId, nonce: asPing.nonce }),
          'utf8',
        );
        // An unhandled rejection here would take the whole core process down.
        void udp
          .send({ data: reply, address: msg.address, port: BEACON_PORT })
          .catch((err) => logger.debug('pong send failed', { err: String(err) }));
      } else {
        onPingPong?.(asPing as PingPayload);
      }
      return;
    }

    const beacon = parsed as BeaconPayload;
    if (!beacon?.id || beacon.id === identity.deviceId) return;
    onSighting({
      deviceId: beacon.id,
      name: beacon.name,
      os: (beacon.os as Sighting['os']) ?? 'unknown',
      fingerprint: beacon.fp,
      port: beacon.port,
      address: {
        address: msg.address,
        family: msg.address.includes(':') ? 'IPv6' : 'IPv4',
        iface: iface.name,
        linkType: classifyLinkType(iface),
      },
    });
  }

  /** Binds newly-appeared interface addresses and drops ones that went away. */
  async function syncBindings(onSighting: (s: Sighting) => void) {
    if (stopped) return;
    let ifaces: NetworkInterfaceInfo[];
    try {
      ifaces = await interfaces.list();
    } catch (err) {
      logger.warn('interface enumeration failed', { err: String(err) });
      return;
    }
    const ignored = ignoredInterfaces();
    const wanted = new Map<string, { iface: NetworkInterfaceInfo; address: string }>();
    for (const iface of ifaces) {
      if (ignored.includes(iface.name)) continue;
      for (const addr of usableIpv4(iface)) {
        wanted.set(`${iface.name}|${addr.address}`, { iface, address: addr.address });
      }
    }

    for (const [key, socket] of bound) {
      if (!wanted.has(key)) {
        socket.handle.close();
        bound.delete(key);
        logger.debug('beacon socket released', { key });
      } else {
        // Keep the cached interface metadata fresh (a cable may have just
        // acquired or lost a routable address, changing its link type).
        socket.iface = wanted.get(key)!.iface;
      }
    }

    for (const [key, { iface, address }] of wanted) {
      if (bound.has(key)) continue;
      try {
        const handle = await udp.bind({
          port: BEACON_PORT,
          iface: iface.name,
          address,
          family: 'IPv4',
          multicastGroups: [MULTICAST_GROUP],
          onMessage: (msg) => {
            const current = bound.get(key);
            handleMessage(current?.iface ?? iface, msg, onSighting);
          },
        });
        bound.set(key, { key, iface, address, handle });
        logger.debug('beacon socket bound', { iface: iface.name, address });
      } catch (err) {
        logger.warn('beacon bind failed', { iface: iface.name, address, err: String(err) });
      }
    }
  }

  return {
    async start(onSighting) {
      stopped = false;
      await syncBindings(onSighting);
      await broadcastOnce();
      beaconTimer = clock.setInterval(() => {
        void broadcastOnce().catch((err) => logger.debug('beacon cycle failed', { err: String(err) }));
      }, BEACON_INTERVAL_MS);
      // Picking up a cable plugged in after launch used to require a restart.
      rebindTimer = clock.setInterval(() => {
        void syncBindings(onSighting).catch((err) => logger.debug('rebind failed', { err: String(err) }));
      }, REBIND_INTERVAL_MS);
    },

    async stop() {
      stopped = true;
      if (beaconTimer) clock.clearInterval(beaconTimer);
      if (rebindTimer) clock.clearInterval(rebindTimer);
      for (const socket of bound.values()) socket.handle.close();
      bound.clear();
      udp.close?.();
    },
  };
}
