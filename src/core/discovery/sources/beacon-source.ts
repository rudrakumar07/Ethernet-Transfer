import type { Clock, InterfaceProvider, Logger, UdpTransport } from '../../ports';
import type { Identity } from '../../identity';
import type { DiscoverySource } from './source';
import type { Sighting } from '../logic/device-merge';
import { classifyLinkType } from '../logic/link-type';

export const BEACON_PORT = 47801;
const MULTICAST_GROUP = '239.255.77.77';
const BEACON_INTERVAL_MS = 2000;

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

export function createBeaconSource(deps: BeaconSourceDeps): DiscoverySource {
  const { udp, interfaces, identity, clock, logger, transferPort, ignoredInterfaces, onPingPong } = deps;
  const sockets: { close(): void }[] = [];
  let interval: unknown;

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
    const ifaces = await interfaces.list();
    for (const iface of ifaces) {
      if (ignoredInterfaces().includes(iface.name)) continue;
      for (const addr of iface.addresses) {
        try {
          if (addr.family === 'IPv4') {
            await udp.send({ data, address: MULTICAST_GROUP, port: BEACON_PORT });
            if (iface.broadcast) {
              await udp.send({ data, address: iface.broadcast, port: BEACON_PORT });
            }
          } else {
            await udp.send({ data, address: `ff02::1%${iface.name}`, port: BEACON_PORT });
          }
        } catch (err) {
          logger.debug('beacon send failed', { iface: iface.name, err: String(err) });
        }
      }
    }
  }

  return {
    async start(onSighting) {
      const ifaces = await interfaces.list();
      for (const iface of ifaces) {
        if (ignoredInterfaces().includes(iface.name)) continue;
        try {
          const handle = await udp.bind({
            port: BEACON_PORT,
            iface: iface.name,
            multicastGroups: [MULTICAST_GROUP],
            onMessage: (msg) => {
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
                  void udp.send({ data: reply, address: msg.address, port: BEACON_PORT });
                } else {
                  onPingPong?.(asPing as PingPayload);
                }
                return;
              }

              const beacon = parsed as BeaconPayload;
              if (!beacon?.id || beacon.id === identity.deviceId) return;
              const sighting: Sighting = {
                deviceId: beacon.id,
                name: beacon.name,
                os: (beacon.os as Sighting['os']) ?? 'unknown',
                fingerprint: beacon.fp,
                port: beacon.port,
                address: {
                  address: msg.address,
                  family: msg.address.includes(':') ? 'IPv6' : 'IPv4',
                  iface: msg.iface,
                  linkType: classifyLinkType(iface),
                },
              };
              onSighting(sighting);
            },
          });
          sockets.push(handle);
        } catch (err) {
          logger.warn('beacon bind failed', { iface: iface.name, err: String(err) });
        }
      }

      await broadcastOnce();
      interval = clock.setInterval(() => void broadcastOnce(), BEACON_INTERVAL_MS);
    },

    async stop() {
      if (interval) clock.clearInterval(interval);
      for (const s of sockets) s.close();
      sockets.length = 0;
    },
  };
}
