import type { Duplex } from 'node:stream';

export interface TlsPeer {
  fingerprint: string;
}

export interface TlsConnection {
  socket: Duplex;
  peer: TlsPeer;
  close(): void;
}

export interface TlsServerHandle {
  port: number;
  close(): Promise<void>;
}

/** TLS transport port. Real impl wraps node:tls; fakes use in-process duplex pairs. */
export interface TlsTransport {
  listen(opts: {
    cert: string;
    key: string;
    preferredPort: number;
    onConnection: (conn: TlsConnection) => void;
  }): Promise<TlsServerHandle>;
  connect(opts: {
    cert: string;
    key: string;
    host: string;
    port: number;
    timeoutMs: number;
  }): Promise<TlsConnection>;
}

export interface UdpMessage {
  data: Buffer;
  address: string;
  port: number;
  iface: string;
}

/** UDP transport port for discovery beacons and latency ping/pong. */
export interface UdpTransport {
  /**
   * Binds a socket for one local interface address. `address` matters: binding
   * the wildcard and joining a multicast group without naming an interface
   * only ever joins on the default-route interface, which is exactly why a
   * direct cable (no default route) never saw a beacon.
   */
  bind(opts: {
    port: number;
    iface: string;
    /** Local interface address to bind and join multicast groups on. */
    address?: string;
    family?: 'IPv4' | 'IPv6';
    multicastGroups?: string[];
    onMessage: (msg: UdpMessage) => void;
  }): Promise<{ close(): void }>;
  /** `ifaceAddress` selects the egress interface for multicast/broadcast sends. */
  send(opts: {
    data: Buffer;
    address: string;
    port: number;
    iface?: string;
    ifaceAddress?: string;
  }): Promise<void>;
  /** Releases any sockets the transport keeps for sending. */
  close?(): void;
}

export interface InterfaceAddress {
  address: string;
  family: 'IPv4' | 'IPv6';
  internal: boolean;
  netmask?: string;
  /** IPv4 directed broadcast for this address, when one can be computed. */
  broadcast?: string;
}

export interface NetworkInterfaceInfo {
  name: string;
  addresses: InterfaceAddress[];
  wireless: boolean;
  hasRoutableAddress: boolean;
}

/** Local interface enumeration port. */
export interface InterfaceProvider {
  list(): Promise<NetworkInterfaceInfo[]>;
}

/** mDNS/DNS-SD port. */
export interface MdnsProvider {
  advertise(opts: { name: string; port: number; txt: Record<string, string> }): void;
  browse(onFound: (txt: Record<string, string>, address: string, port: number) => void): void;
  stop(): void;
}
