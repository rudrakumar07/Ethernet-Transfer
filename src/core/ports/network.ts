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
  bind(opts: {
    port: number;
    iface: string;
    multicastGroups?: string[];
    onMessage: (msg: UdpMessage) => void;
  }): Promise<{ close(): void }>;
  send(opts: { data: Buffer; address: string; port: number; iface?: string }): Promise<void>;
}

export interface NetworkInterfaceInfo {
  name: string;
  addresses: { address: string; family: 'IPv4' | 'IPv6'; internal: boolean }[];
  broadcast?: string;
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
