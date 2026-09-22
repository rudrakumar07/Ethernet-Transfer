import type { Device, TransferId } from '../../shared/types';
import type { TlsConnection, TlsTransport } from '../ports';
import type { Identity } from '../identity';
import { compareAddressPriority } from '../discovery';
import { FrameType, PROTOCOL_VERSION, encodeControlFrame } from '../../shared/protocol';
import { endGracefully } from './protocol/flow-control';

const CONNECT_TIMEOUT_MS = 2000;

/** Try a device's addresses in link-priority order (spec §4.3). */
export async function connectToDevice(
  tls: TlsTransport,
  identity: Identity,
  device: Device,
): Promise<TlsConnection> {
  const sorted = [...device.addresses].sort((a, b) => compareAddressPriority(a.linkType, b.linkType));
  let lastError: unknown;
  for (const addr of sorted) {
    try {
      return await tls.connect({
        cert: identity.certPem,
        key: identity.keyPem,
        host: addr.address,
        port: device.port,
        timeoutMs: CONNECT_TIMEOUT_MS,
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('unreachable');
}

/**
 * Receiver-initiated resume (spec §5.7 "Receiver paused"): connect to the
 * original sender as a client just long enough to say "please reconnect and
 * resume transfer X", then close. The actual file data still flows the
 * normal direction, sender -> receiver, once the sender reconnects.
 */
export async function sendResumeRequest(
  tls: TlsTransport,
  identity: Identity,
  appVersion: string,
  device: Device,
  transferId: TransferId,
): Promise<void> {
  const conn = await connectToDevice(tls, identity, device);
  try {
    conn.socket.write(
      encodeControlFrame(FrameType.HELLO, {
        protocolVersion: PROTOCOL_VERSION,
        appVersion,
        deviceId: identity.deviceId,
        name: identity.name,
        os: identity.os,
      }),
    );
    conn.socket.write(encodeControlFrame(FrameType.RESUME_REQUEST, { transferId }));
  } finally {
    // Destroying straight after the writes could drop them from the send
    // buffer, so Resume on an incoming transfer silently did nothing.
    await endGracefully(conn.socket as never, () => conn.close());
  }
}
