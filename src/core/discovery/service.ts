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

export interface DiscoveryEvents {
  deviceUp: Device;
  deviceUpdated: Device;
  deviceDown: { deviceId: DeviceId };
}

export interface DiscoveryService {
  events: TypedEmitter<DiscoveryEvents>;
  listDevices(): Device[];
  getDevice(id: DeviceId): Device | undefined;
  connectByAddress(address: string, port: number): Promise<Device>;
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

    async connectByAddress(address, port) {
      // A manual device is provisionally added; its real identity is confirmed
      // on first TLS handshake (spec §4.3 "Connect by address").
      const deviceId = `manual:${address}:${port}`;
      const device: Device = {
        id: deviceId,
        name: address,
        os: 'unknown',
        fingerprint: '',
        shortId: '----',
        addresses: [{ address, family: address.includes(':') ? 'IPv6' : 'IPv4', iface: 'manual', linkType: 'wired' }],
        linkType: 'wired',
        manual: true,
        trusted: false,
        lastSeen: clock.now(),
        port,
      };
      devices.set(deviceId, device);
      events.emit('deviceUp', device);
      return device;
    },

    async start() {
      sources = [
        createBeaconSource({
          udp: deps.udp,
          interfaces: deps.interfaces,
          identity,
          clock,
          logger,
          transferPort: deps.transferPort,
          ignoredInterfaces: () => settings.get().ignoredInterfaces,
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
          if (device.manual) continue;
          if (!isOnline(device.lastSeen, now)) {
            devices.delete(device.id);
            events.emit('deviceDown', { deviceId: device.id });
          }
        }
      }, PRESENCE_CHECK_MS);
    },

    async stop() {
      if (presenceTimer) clock.clearInterval(presenceTimer);
      for (const source of sources) await source.stop();
    },
  };
}
