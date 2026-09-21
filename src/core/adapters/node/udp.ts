import dgram from 'node:dgram';
import type { UdpTransport } from '../../ports';

/**
 * Sending sockets are pooled per family. The previous implementation created a
 * fresh dgram socket for every single datagram - beacons alone are N addresses
 * every 2s - and leaked it whenever send() failed before its callback ran.
 */
export function createNodeUdpTransport(): UdpTransport {
  const senders = new Map<'udp4' | 'udp6', dgram.Socket>();

  async function sender(type: 'udp4' | 'udp6'): Promise<dgram.Socket> {
    const existing = senders.get(type);
    if (existing) return existing;
    const socket = dgram.createSocket({ type, reuseAddr: true });
    socket.on('error', () => {
      // A send error is reported through its callback; nothing to do here, but
      // an unhandled 'error' event on a dgram socket would take the process
      // down, so this listener must exist.
    });
    await new Promise<void>((resolve) => {
      socket.bind(0, () => {
        socket.setBroadcast(true);
        try {
          socket.setMulticastTTL(1);
          // Loopback on: two instances on one host (two user accounts, or a
          // test rig) should still find each other. A device filters out its
          // own beacons by deviceId, so this costs nothing.
          socket.setMulticastLoopback(true);
        } catch {
          // not fatal; some platforms refuse these before a group is joined
        }
        socket.unref();
        resolve();
      });
    });
    senders.set(type, socket);
    return socket;
  }

  return {
    async bind({ port, iface, address, family, multicastGroups, onMessage }) {
      const resolvedFamily =
        family ?? (address?.includes(':') || iface.includes(':') ? 'IPv6' : 'IPv4');
      const type = resolvedFamily === 'IPv6' ? 'udp6' : 'udp4';
      const socket = dgram.createSocket({ type, reuseAddr: true });

      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => reject(err);
        socket.once('error', onError);
        // Binding the wildcard here was the bug: with reuseAddr every
        // interface's socket ended up on 0.0.0.0, so each one saw every packet
        // (N duplicate sightings per beacon) and `iface` - which is what the
        // link-type classifier trusts - was whichever socket happened to
        // deliver it rather than where the packet truly arrived.
        socket.bind({ port, address: type === 'udp4' ? address : undefined, exclusive: false }, () => {
          socket.removeListener('error', onError);
          try {
            socket.setBroadcast(true);
          } catch {
            // some virtual interfaces refuse broadcast; multicast still works
          }
          for (const group of multicastGroups ?? []) {
            try {
              // Naming the interface is what makes this work on a link with no
              // default route, such as a direct Ethernet cable.
              socket.addMembership(group, type === 'udp4' ? address : undefined);
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

      return {
        close: () => {
          try {
            socket.close();
          } catch {
            // already closed
          }
        },
      };
    },

    async send({ data, address, port, ifaceAddress }) {
      const type = address.includes(':') ? 'udp6' : 'udp4';
      const socket = await sender(type);
      if (ifaceAddress && type === 'udp4' && isMulticast(address)) {
        try {
          socket.setMulticastInterface(ifaceAddress);
        } catch {
          // falls back to the default-route interface
        }
      }
      await new Promise<void>((resolve) => {
        try {
          socket.send(data, port, address, () => resolve());
        } catch {
          // An immediate throw (bad address, closed socket) is not worth
          // propagating into the beacon loop; the next beacon retries.
          resolve();
        }
      });
    },

    close() {
      for (const socket of senders.values()) {
        try {
          socket.close();
        } catch {
          // already closed
        }
      }
      senders.clear();
    },
  };
}

function isMulticast(address: string): boolean {
  const first = Number(address.split('.')[0]);
  return first >= 224 && first <= 239;
}
