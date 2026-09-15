import tls from 'node:tls';
import type { TlsTransport } from '../../ports';

export function createNodeTlsTransport(): TlsTransport {
  return {
    async listen({ cert, key, preferredPort, onConnection }) {
      const server = tls.createServer(
        { cert, key, requestCert: true, rejectUnauthorized: false, minVersion: 'TLSv1.3' },
        (socket) => {
          const peerCert = socket.getPeerCertificate();
          const fingerprint = (peerCert.fingerprint256 ?? '').replace(/:/g, '').toLowerCase();
          onConnection({
            socket,
            peer: { fingerprint },
            close: () => socket.destroy(),
          });
        },
      );

      const port = await new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(preferredPort, () => {
          server.removeListener('error', reject);
          const addr = server.address();
          resolve(typeof addr === 'object' && addr ? addr.port : preferredPort);
        });
      }).catch(async () => {
        // preferred port taken -> let the OS pick one
        return new Promise<number>((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, () => {
            const addr = server.address();
            resolve(typeof addr === 'object' && addr ? addr.port : 0);
          });
        });
      });

      return {
        port,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
      };
    },

    async connect({ cert, key, host, port, timeoutMs }) {
      return new Promise((resolve, reject) => {
        const socket = tls.connect({
          host,
          port,
          cert,
          key,
          rejectUnauthorized: false,
          minVersion: 'TLSv1.3',
          timeout: timeoutMs,
        });
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error('connect-timeout'));
        }, timeoutMs);

        socket.once('secureConnect', () => {
          clearTimeout(timer);
          const peerCert = socket.getPeerCertificate();
          const fingerprint = (peerCert.fingerprint256 ?? '').replace(/:/g, '').toLowerCase();
          resolve({ socket, peer: { fingerprint }, close: () => socket.destroy() });
        });
        socket.once('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    },
  };
}
