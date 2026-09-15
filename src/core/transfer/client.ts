import type { Device } from '../../shared/types';
import type { TlsConnection, TlsTransport } from '../ports';
import type { Identity } from '../identity';
import { compareAddressPriority } from '../discovery';

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
