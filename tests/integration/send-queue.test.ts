import { describe, it, expect } from 'vitest';
import { createTransferService } from '../../src/core/transfer/service';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createSilentLogger } from '../fakes/logger';
import { createFakePlatform } from '../fakes/platform';
import { createSocketPair, type FakeSocket } from '../fakes/socket-pair';
import { FrameType, encodeControlFrame } from '../../src/shared/protocol';
import { helloFrame } from '../fakes/hello';
import type { Device, TransferItem } from '../../src/shared/types';
import type { TlsConnection, TlsTransport } from '../../src/core/ports';

/**
 * Regression coverage for the bug caught during lint cleanup:
 * MAX_CONCURRENT_PER_DIRECTION was declared but never enforced - every
 * send() started immediately regardless of how many were already active.
 * This drives createTransferService directly (not just a raw session) so
 * a slow "receiver" (here, a socket that never replies ACCEPT) genuinely
 * occupies a slot until it finishes.
 */
describe('outbound send queue', () => {
  it('runs at most 3 sends concurrently and starts the 4th once one finishes', async () => {
    const fs = createFakeFileSystem();
    for (let i = 0; i < 4; i++) {
      const w = await fs.openWrite(`/src/file${i}.txt`, {});
      await w.write(Buffer.from(`content ${i}`));
      await w.close();
    }

    const device: Device = {
      id: 'dev-1',
      name: 'Peer',
      os: 'linux',
      fingerprint: 'fp-1',
      shortId: 'AAAA-BBBB',
      addresses: [{ address: '10.0.0.2', family: 'IPv4', iface: 'eth0', linkType: 'wired' }],
      linkType: 'wired',
      manual: false,
      trusted: true,
      lastSeen: Date.now(),
      port: 47800,
    };

    // Each connect() call hands back one half of a fresh socket pair; the
    // other half is left "silent" (never sends ACCEPT), so the sender
    // session just sits waiting - exactly the slot-holding behavior we're
    // testing the cap against.
    const pendingPeerSockets: FakeSocket[] = [];
    const tls: TlsTransport = {
      listen: async () => ({ port: 47800, close: async () => {} }),
      connect: async () => {
        const [a, b] = createSocketPair();
        pendingPeerSockets.push(b);
        return { socket: a as never, peer: { fingerprint: 'fp-1' }, close: () => a.destroy() } satisfies TlsConnection;
      },
    };

    const service = createTransferService({
      fs,
      platform: createFakePlatform(),
      tls,
      identity: { deviceId: 'me', name: 'Me', os: 'linux', certPem: '', keyPem: '', fingerprint: 'me-fp', shortId: 'ME00' },
      trust: { isTrusted: () => true, trust: async () => {}, untrust: async () => {}, checkIdentity: () => 'ok', list: () => [] },
      discovery: {
        events: new (await import('../../src/shared/typed-emitter')).TypedEmitter(),
        listDevices: () => [device],
        getDevice: (id) => (id === device.id ? device : undefined),
        markSeen: () => {},
        refreshTrust: () => {},
        start: async () => {},
        stop: async () => {},
      },
      settings: {
        get: () => ({
          deviceName: 'Me', downloadDir: '/dl', autoAcceptTrusted: true, theme: 'system', startOnLogin: false,
          minimizeToTray: true, ignoredInterfaces: [],
        }),
        update: async (p) => ({ ...p }) as never,
        events: new (await import('../../src/shared/typed-emitter')).TypedEmitter(),
      },
      stats: {
        recordDeviceCount: () => {}, recordThroughput: () => {}, recordDeviceBytes: () => {},
        snapshot: () => ({ devicesOnline: [], throughputSent: [], throughputReceived: [], perDeviceBytes: [] }),
        tick: () => ({ devicesOnline: 0, speedSentBps: 0, speedReceivedBps: 0 }),
        start: () => {}, stop: () => {},
      },
      logger: createSilentLogger(),
      buildFileList: async (paths) => {
        const items: TransferItem[] = paths.map((p, i) => ({
          index: i, relPath: `file${i}.txt`, kind: 'file', size: 9, mtimeMs: 1,
        }));
        return Object.assign(items, { sources: new Map(paths.map((p, i) => [i, p])) });
      },
    });

    await service.send('dev-1', ['/src/file0.txt']);
    await service.send('dev-1', ['/src/file1.txt']);
    await service.send('dev-1', ['/src/file2.txt']);
    await service.send('dev-1', ['/src/file3.txt']);

    // Let all the microtask-scheduled connect()/HELLO work settle.
    await new Promise((r) => setTimeout(r, 20));

    const statuses = service.list().map((t) => t.status);
    expect(statuses.filter((s) => s === 'active')).toHaveLength(3);
    expect(statuses.filter((s) => s === 'queued')).toHaveLength(1);
    expect(pendingPeerSockets).toHaveLength(3); // only 3 connections were actually opened

    // Finish the first one: reply HELLO then DECLINE, which ends that session.
    const first = pendingPeerSockets[0];
    first.write(helloFrame('dev-1'));
    first.write(encodeControlFrame(FrameType.DECLINE, { reason: 'user' }));

    await new Promise((r) => setTimeout(r, 20));

    const statusesAfter = service.list().map((t) => t.status);
    expect(statusesAfter.filter((s) => s === 'active')).toHaveLength(3); // the queued one took the freed slot
    expect(statusesAfter.filter((s) => s === 'declined')).toHaveLength(1);
    expect(pendingPeerSockets).toHaveLength(4); // the 4th connection has now been opened
  });
});
