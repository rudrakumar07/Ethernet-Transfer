import type { Clock, Logger, UdpTransport } from '../ports';
import type { Identity } from '../identity';
import { BEACON_PORT } from './sources/beacon-source';

export interface LatencyProbeDeps {
  udp: UdpTransport;
  clock: Clock;
  identity: Identity;
  logger: Logger;
  onLatency: (deviceId: string, ms: number) => void;
}

const PING_INTERVAL_MS = 5000;
const PENDING_TTL_MS = 15000;

/**
 * Pings every known device over UDP every 5s and reports RTT via onLatency
 * once the matching pong arrives (spec §4.5). The reply-half lives in
 * beacon-source.ts, which shares the same UDP socket.
 */
export function startLatencyProbe(
  deps: LatencyProbeDeps,
  listDeviceAddresses: () => { deviceId: string; address: string }[],
): { handlePong(payload: { from: string; nonce: string }): void; stop(): void } {
  const { udp, clock, identity, logger, onLatency } = deps;
  const pending = new Map<string, { deviceId: string; sentAt: number }>();

  const interval = clock.setInterval(() => {
    const now = clock.now();
    // Drop stale pings that never got a reply.
    for (const [nonce, p] of pending) {
      if (now - p.sentAt > PENDING_TTL_MS) pending.delete(nonce);
    }

    for (const { deviceId, address } of listDeviceAddresses()) {
      const nonce = `${deviceId}:${now}:${Math.random().toString(36).slice(2, 8)}`;
      pending.set(nonce, { deviceId, sentAt: now });
      const payload = Buffer.from(
        JSON.stringify({ type: 'ping', from: identity.deviceId, nonce }),
        'utf8',
      );
      void udp.send({ data: payload, address, port: BEACON_PORT }).catch((err) => {
        logger.debug('latency ping send failed', { deviceId, err: String(err) });
      });
    }
  }, PING_INTERVAL_MS);

  return {
    handlePong(payload) {
      const entry = pending.get(payload.nonce);
      if (!entry) return;
      pending.delete(payload.nonce);
      onLatency(entry.deviceId, clock.now() - entry.sentAt);
    },
    stop: () => clock.clearInterval(interval),
  };
}
