import type { Logger, TlsConnection, TlsTransport } from '../ports';
import type { Identity } from '../identity';
import type { TrustService } from '../trust';

export interface TransferServerDeps {
  tls: TlsTransport;
  identity: Identity;
  trust: TrustService;
  logger: Logger;
  onConnection: (conn: TlsConnection) => void;
  preferredPort: number;
}

export interface TransferServer {
  port: number;
  close(): Promise<void>;
}

const PREFERRED_PORT = 47800;

export async function startTransferServer(deps: TransferServerDeps): Promise<TransferServer> {
  const { tls, identity, logger, onConnection, preferredPort } = deps;
  const handle = await tls.listen({
    cert: identity.certPem,
    key: identity.keyPem,
    preferredPort: preferredPort ?? PREFERRED_PORT,
    onConnection: (conn) => {
      logger.debug('incoming transfer connection', { fingerprint: conn.peer.fingerprint });
      onConnection(conn);
    },
  });
  return handle;
}

export { PREFERRED_PORT };
