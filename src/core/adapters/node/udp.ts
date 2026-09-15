import dgram from 'node:dgram';
import type { UdpTransport } from '../../ports';

export function createNodeUdpTransport(): UdpTransport {
  return {
    async bind({ port, iface, multicastGroups, onMessage }) {
      const family = iface.includes(':') ? 'udp6' : 'udp4';
      const socket = dgram.createSocket({ type: family, reuseAddr: true });
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(port, () => {
          socket.removeListener('error', reject);
          socket.setBroadcast(true);
          for (const group of multicastGroups ?? []) {
            try {
              socket.addMembership(group);
            } catch {
              // best-effort: some interfaces can't join multicast
            }
          }
          resolve();
        });
      });
      socket.on('message', (data, rinfo) => {
        onMessage({ data, address: rinfo.address, port: rinfo.port, iface });
      });
      socket.on('error', () => {
        /* swallow post-bind errors; discovery degrades gracefully */
      });
      return { close: () => socket.close() };
    },

    async send({ data, address, port }) {
      const family = address.includes(':') ? 'udp6' : 'udp4';
      const socket = dgram.createSocket(family);
      await new Promise<void>((resolve) => {
        socket.send(data, port, address, () => {
          socket.close();
          resolve();
        });
      });
    },
  };
}
