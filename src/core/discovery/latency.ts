import type { Clock, Logger, UdpTransport } from '../ports';
import type { Identity } from '../identity';
import { BEACON_PORT } from './sources/beacon-source';

export interface LatencyDeps {
  udp: UdpTransport;
  clock: Clock;
  identity: Identity;
  logger: Logger;
  getDeviceAddress: (deviceId: string) => { address: string } | undefined;
  onLatency: (deviceId: string, ms: number) => void;
}

const PING_INTERVAL_MS = 5000;

export function startLatencyProbe(deps: LatencyDeps, deviceIds: () => string[]): { stop(): void } {
  const { udp, clock, identity, getDeviceAddress, onLatency } = deps;
  const pending = new Map<string, number>();

  const interval = clock.setInterval(() => {
    for (const deviceId of deviceIds()) {
      const addr = getDeviceAddress(deviceId);
      if (!addr) continue;
      const nonce = `${deviceId}:${clock.now()}`;
      pending.set(nonce, clock.now());
      const payload = Buffer.from(
        JSON.stringify({ type: 'ping', from: identity.deviceId, nonce }),
        'utf8',
      );
      void udp.send({ data: payload, address: addr.address, port: BEACON_PORT });
    }
  }, PING_INTERVAL_MS);

  return {
    stop: () => clock.clearInterval(interval),
  };
}
