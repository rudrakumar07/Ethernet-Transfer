import { createTransferService, type TransferDeps } from '../../src/core/transfer/service';
import { createFakeFileSystem } from './filesystem';
import { createSilentLogger } from './logger';
import { createFakePlatform } from './platform';
import { TypedEmitter } from '../../src/shared/typed-emitter';
import type { TlsConnection, TlsTransport } from '../../src/core/ports';
import type { Device, Settings, TransferItem } from '../../src/shared/types';
import type { FakeSocket } from './socket-pair';

export const testDevice: Device = {
  id: 'dev-1',
  name: 'Peer',
  os: 'linux',
  fingerprint: 'peer-fingerprint-abc',
  shortId: 'PEER-0001',
  addresses: [{ address: '10.0.0.2', family: 'IPv4', iface: 'eth0', linkType: 'wired' }],
  linkType: 'wired',
  manual: false,
  trusted: false,
  lastSeen: Date.now(),
  port: 47800,
};

export interface Harness {
  service: ReturnType<typeof createTransferService>;
  fs: ReturnType<typeof createFakeFileSystem>;
  /** Fingerprints passed to trust.trust(), in call order. */
  trusted: string[];
  /** Hands the service an inbound connection from `fingerprint`; returns the peer's socket half. */
  acceptConnection(socketPair: [FakeSocket, FakeSocket], fingerprint: string): FakeSocket;
  markedSeen: string[];
  connections: FakeSocket[];
}

export function createHarness(
  overrides: {
    settings?: Partial<Settings>;
    isTrusted?: (fp: string) => boolean;
    connect?: TlsTransport['connect'];
    items?: TransferItem[];
    buildFileList?: TransferDeps['buildFileList'];
  } = {},
): Harness {
  const fs = createFakeFileSystem();
  const trusted: string[] = [];
  const markedSeen: string[] = [];
  const connections: FakeSocket[] = [];
  let onConnection: ((conn: TlsConnection) => void) | undefined;

  const settings: Settings = {
    deviceName: 'Me',
    downloadDir: '/dl',
    autoAcceptTrusted: true,
    theme: 'system',
    startOnLogin: false,
    minimizeToTray: true,
    ignoredInterfaces: [],
    ...overrides.settings,
  };

  const tls: TlsTransport = {
    listen: async (opts) => {
      onConnection = opts.onConnection;
      return { port: 47800, close: async () => {} };
    },
    connect: overrides.connect ?? (async () => {
      throw new Error('connect not configured for this harness');
    }),
  };

  const deps: TransferDeps = {
    fs,
    platform: createFakePlatform(),
    tls,
    identity: {
      deviceId: 'me', name: 'Me', os: 'linux', certPem: '', keyPem: '', fingerprint: 'my-fp', shortId: 'ME00',
    },
    trust: {
      isTrusted: overrides.isTrusted ?? (() => false),
      trust: async (r) => {
        trusted.push(r.fingerprint);
      },
      untrust: async () => {},
      checkIdentity: () => 'ok',
      list: () => [],
    },
    discovery: {
      events: new TypedEmitter(),
      listDevices: () => [testDevice],
      getDevice: (id) => (id === testDevice.id ? testDevice : undefined),
      markSeen: (id) => markedSeen.push(id),
      refreshTrust: () => {},
      start: async () => {},
      stop: async () => {},
    },
    settings: { get: () => settings, update: async () => settings, events: new TypedEmitter() },
    stats: {
      recordDeviceCount: () => {}, recordThroughput: () => {}, recordDeviceBytes: () => {},
      snapshot: () => ({ devicesOnline: [], throughputSent: [], throughputReceived: [], perDeviceBytes: [] }),
      tick: () => ({ devicesOnline: 0, speedSentBps: 0, speedReceivedBps: 0 }),
      start: () => {}, stop: () => {},
    },
    logger: createSilentLogger(),
    buildFileList:
      overrides.buildFileList ??
      (async (paths) => {
        const items: TransferItem[] = overrides.items ?? paths.map((p, i) => ({
          index: i, relPath: `file${i}.bin`, kind: 'file', size: 9, mtimeMs: 1,
        }));
        return Object.assign(items, { sources: new Map(items.map((it, i) => [it.index, paths[i] ?? paths[0]])) });
      }),
  };

  const service = createTransferService(deps);

  return {
    service,
    fs,
    trusted,
    markedSeen,
    connections,
    acceptConnection([ours, peer], fingerprint) {
      connections.push(ours);
      onConnection?.({ socket: ours as never, peer: { fingerprint }, close: () => ours.destroy() });
      return peer;
    },
  };
}
