import { describe, it, expect } from 'vitest';
import { createHarness } from '../fakes/service-harness';
import { createSocketPair } from '../fakes/socket-pair';
import { helloFrame } from '../fakes/hello';
import { FrameType, encodeControlFrame } from '../../src/shared/protocol';

const PEER_FP = 'peer-fingerprint-abc';
const settle = () => new Promise((r) => setTimeout(r, 30));

function openOffer(peer: ReturnType<typeof createSocketPair>[1], transferId: string) {
  peer.write(helloFrame('peer'));
  peer.write(
    encodeControlFrame(FrameType.OFFER, {
      transferId,
      items: [{ index: 0, relPath: 'a.bin', kind: 'file', size: 8, mtimeMs: 1 }],
      totalBytes: 8,
      fileCount: 1,
    }),
  );
}

/**
 * Regression coverage for the zombie receive found while cancelling a real
 * 200 MiB transfer: the receiver session handled CANCEL and dropped
 * connections without ever telling the service, so an inbound transfer stayed
 * "active" forever - no Resume, no Cancel, just a row stuck at 78%.
 */
describe('inbound transfer terminal states', () => {
  it('marks a receive interrupted when the connection drops mid-file', async () => {
    const h = createHarness({ isTrusted: () => true });
    await h.service.start();

    const pair = createSocketPair();
    const peer = h.acceptConnection(pair, PEER_FP);
    openOffer(peer, 'tx-drop');
    await settle();

    peer.write(encodeControlFrame(FrameType.FILE_START, { index: 0, offset: 0 }));
    await settle();
    expect(h.service.list().find((t) => t.id === 'tx-drop')?.status).toBe('active');

    // The peer vanishes - cable unplugged, app killed, Wi-Fi dropped.
    peer.destroy();
    await settle();

    expect(h.service.list().find((t) => t.id === 'tx-drop')?.status).toBe('interrupted');
  });

  it('marks a receive cancelled when the sender cancels', async () => {
    const h = createHarness({ isTrusted: () => true });
    await h.service.start();

    const pair = createSocketPair();
    const peer = h.acceptConnection(pair, PEER_FP);
    openOffer(peer, 'tx-cancel');
    await settle();

    peer.write(encodeControlFrame(FrameType.FILE_START, { index: 0, offset: 0 }));
    await settle();
    peer.write(encodeControlFrame(FrameType.CANCEL, {}));
    await settle();

    expect(h.service.list().find((t) => t.id === 'tx-cancel')?.status).toBe('cancelled');
  });

  it('leaves a completed receive alone when the connection then closes', async () => {
    const h = createHarness({ isTrusted: () => true });
    await h.service.start();

    const pair = createSocketPair();
    const peer = h.acceptConnection(pair, PEER_FP);
    peer.write(helloFrame('peer'));
    peer.write(
      encodeControlFrame(FrameType.OFFER, {
        transferId: 'tx-done',
        items: [{ index: 0, relPath: 'a.bin', kind: 'file', size: 4, mtimeMs: 1 }],
        totalBytes: 4,
        fileCount: 1,
      }),
    );
    await settle();

    const header = Buffer.alloc(5);
    header.writeUInt8(FrameType.DATA, 0);
    header.writeUInt32BE(4, 1);
    peer.write(encodeControlFrame(FrameType.FILE_START, { index: 0, offset: 0 }));
    peer.write(Buffer.concat([header, Buffer.from('abcd')]));
    const { createHash } = await import('node:crypto');
    peer.write(
      encodeControlFrame(FrameType.FILE_END, {
        index: 0,
        sha256: createHash('sha256').update(Buffer.from('abcd')).digest('hex'),
      }),
    );
    await settle();
    peer.destroy();
    await settle();

    expect(h.service.list().find((t) => t.id === 'tx-done')?.status).toBe('completed');
  });
});
