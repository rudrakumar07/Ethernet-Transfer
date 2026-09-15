import type { Device, DeviceAddress, DeviceId } from '../../../shared/types';
import { bestLinkType } from './link-type';

export interface Sighting {
  deviceId: DeviceId;
  name: string;
  os: Device['os'];
  fingerprint: string;
  port: number;
  address: DeviceAddress;
  manual?: boolean;
}

/** Merge a new sighting into the existing device map by deviceId (spec §4.1). */
export function mergeSighting(
  existing: Map<DeviceId, Device>,
  sighting: Sighting,
  now: number,
  shortIdOf: (fingerprint: string) => string,
  isTrusted: (fingerprint: string) => boolean,
): Device {
  const prior = existing.get(sighting.deviceId);
  const addresses: DeviceAddress[] = prior
    ? [
        ...prior.addresses.filter(
          (a) => !(a.address === sighting.address.address && a.iface === sighting.address.iface),
        ),
        sighting.address,
      ]
    : [sighting.address];

  const device: Device = {
    id: sighting.deviceId,
    name: sighting.name,
    os: sighting.os,
    fingerprint: sighting.fingerprint,
    shortId: shortIdOf(sighting.fingerprint),
    addresses,
    linkType: bestLinkType(addresses.map((a) => a.linkType)),
    manual: prior?.manual || sighting.manual === true,
    trusted: isTrusted(sighting.fingerprint),
    latencyMs: prior?.latencyMs,
    lastSeen: now,
    port: sighting.port,
  };
  existing.set(device.id, device);
  return device;
}
