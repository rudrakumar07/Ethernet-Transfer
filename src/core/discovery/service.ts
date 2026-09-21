import type { Clock, InterfaceProvider, Logger, MdnsProvider, UdpTransport } from '../ports';
import type { Identity } from '../identity';
import type { TrustService } from '../trust';
import type { SettingsService } from '../settings';
import { TypedEmitter } from '../../shared/typed-emitter';
import type { Device, DeviceId } from '../../shared/types';
import { mergeSighting } from './logic/device-merge';
import { isOnline } from './logic/presence';
import { createBeaconSource } from './sources/beacon-source';
import { createMdnsSource } from './sources/mdns-source';
import type { DiscoverySource } from './sources/source';
import { startLatencyProbe } from './latency';
import { compareAddressPriority } from './logic/link-type';

export interface DiscoveryEvents {
  deviceUp: Device;
  deviceUpdated: Device;
  deviceDown: { deviceId: DeviceId };
}

export interface DiscoveryService {
  events: TypedEmitter<DiscoveryEvents>;
  listDevices(): Device[];
  getDevice(id: DeviceId): Device | undefined;
  /**
   * Refreshes a device's presence from something other than a beacon - namely
   * bytes moving over a live TLS connection. A connection that is actively
   * carrying a transfer is stronger proof of presence than a UDP beacon, and
   * without this a busy link could drop the very peer it is talking to.
   */
  markSeen(id: DeviceId): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface DiscoveryDeps {
  udp: UdpTransport;
  mdns: MdnsProvider;
  interfaces: InterfaceProvider;
  clock: Clock;
  logger: Logger;
  identity: Identity;
  trust: TrustService;
  settings: SettingsService;
  transferPort: () => number;
}

const PRESENCE_CHECK_MS = 1000;

export function createDiscoveryService(deps: DiscoveryDeps): DiscoveryService {
  const { clock, logger, identity, trust, settings } = deps;
  const events = new TypedEmitter<DiscoveryEvents>();
  const devices = new Map<DeviceId, Device>();
  let sources: DiscoverySource[] = [];
  let presenceTimer: unknown;
  let latencyProbe: ReturnType<typeof startLatencyProbe> | undefined;

  function shortIdOf(fp: string): string {
    const hex = fp.slice(0, 8).toUpperCase();
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
  }

  function handleSighting(sighting: Parameters<typeof mergeSighting>[1]) {
    const wasOnline = devices.has(sighting.deviceId);
    const device = mergeSighting(devices, sighting, clock.now(), shortIdOf, trust.isTrusted.bind(trust));
    events.emit(wasOnline ? 'deviceUpdated' : 'deviceUp', device);
  }

  return {
    events,

    listDevices: () => Array.from(devices.values()),
    getDevice: (id) => devices.get(id),

    markSeen(id) {
      const device = devices.get(id);
      if (device) device.lastSeen = clock.now();
    },

    async start() {
      latencyProbe = startLatencyProbe(
        { udp: deps.udp, clock, identity, logger, onLatency: (deviceId, ms) => {
          const device = devices.get(deviceId);
          if (!device) return;
          device.latencyMs = ms;
          events.emit('deviceUpdated', device);
        } },
        () =>
          Array.from(devices.values())
            .map((d) => {
              const best = [...d.addresses].sort((a, b) => compareAddressPriority(a.linkType, b.linkType))[0];
              return best ? { deviceId: d.id, address: best.address } : undefined;
            })
            .filter((x): x is { deviceId: DeviceId; address: string } => Boolean(x)),
      );

      sources = [
        createBeaconSource({
          udp: deps.udp,
          interfaces: deps.interfaces,
          identity,
          clock,
          logger,
          transferPort: deps.transferPort,
          ignoredInterfaces: () => settings.get().ignoredInterfaces,
          onPingPong: (payload) => latencyProbe?.handlePong(payload),
        }),
        createMdnsSource({
          mdns: deps.mdns,
          interfaces: deps.interfaces,
          identity,
          transferPort: deps.transferPort,
        }),
      ];
      for (const source of sources) {
        try {
          await source.start(handleSighting);
        } catch (err) {
          logger.warn('discovery source failed to start', { err: String(err) });
        }
      }

      presenceTimer = clock.setInterval(() => {
        const now = clock.now();
        for (const device of Array.from(devices.values())) {
          if (!isOnline(device.lastSeen, now)) {
            devices.delete(device.id);
            events.emit('deviceDown', { deviceId: device.id });
          }
        }
      }, PRESENCE_CHECK_MS);
    },

    async stop() {
      if (presenceTimer) clock.clearInterval(presenceTimer);
      latencyProbe?.stop();
      for (const source of sources) await source.stop();
    },
  };
}
