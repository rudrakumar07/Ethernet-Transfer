import { describe, it, expect } from 'vitest';
import { createHarness } from '../fakes/service-harness';
import { createSocketPair } from '../fakes/socket-pair';
import { helloFrame } from '../fakes/hello';
import { FrameType, encodeControlFrame } from '../../src/shared/protocol';
import type { TransferItem, TransferSnapshot } from '../../src/shared/types';

const PEER_FP = 'peer-fingerprint-abc';
const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function dataFrame(bytes: number): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt8(FrameType.DATA, 0);
  header.writeUInt32BE(bytes, 1);
  return Buffer.concat([header, Buffer.alloc(bytes, 1)]);
}

/**
 * Regression coverage from a real 20,000-file folder: every DATA chunk emitted
 * a full snapshot, and each snapshot carried the entire 20,000-entry files
 * array. The core process spent all its time serialising ~60,000 multi-megabyte
 * events, the renderer stopped responding, and the transfer itself stalled at
 * around 3,800 files.
 */
describe('transfer update events under load', () => {
  const manyItems: TransferItem[] = Array.from({ length: 600 }, (_, i) => ({
    index: i,
    relPath: `gallery/img_${i}.jpg`,
    kind: 'file' as const,
    size: 400,
    mtimeMs: 1,
  }));

  it('coalesces rapid progress updates instead of emitting one per chunk', async () => {
    const h = createHarness({ isTrusted: () => true });
    await h.service.start();
    const updates: TransferSnapshot[] = [];
    h.service.events.on('updated', (t) => updates.push(t));

    const peer = h.acceptConnection(createSocketPair(), PEER_FP);
    peer.write(helloFrame('peer'));
    peer.write(
      encodeControlFrame(FrameType.OFFER, {
        transferId: 'tx-load',
        items: manyItems,
        totalBytes: 600 * 400,
        fileCount: 600,
      }),
    );
    await settle();

    const before = updates.length;
    peer.write(encodeControlFrame(FrameType.FILE_START, { index: 0, offset: 0 }));
    for (let i = 0; i < 200; i++) peer.write(dataFrame(2));
    await settle(150);

    const progressEvents = updates.length - before;
    expect(progressEvents).toBeLessThan(50); // 200 chunks must not mean 200 events
    // ...and the latest figure is still accurate, not a stale coalesced one
    const latest = h.service.list().find((t) => t.id === 'tx-load')!;
    expect(latest.bytesDone).toBe(400);
  });

  it('omits the per-file array on progress events for large transfers', async () => {
    const h = createHarness({ isTrusted: () => true });
    await h.service.start();
    const updates: TransferSnapshot[] = [];
    h.service.events.on('updated', (t) => updates.push(t));

    const peer = h.acceptConnection(createSocketPair(), PEER_FP);
    peer.write(helloFrame('peer'));
    peer.write(
      encodeControlFrame(FrameType.OFFER, {
        transferId: 'tx-big',
        items: manyItems,
        totalBytes: 600 * 400,
        fileCount: 600,
      }),
    );
    await settle();

    // A status change always carries the full picture.
    const statusEvent = updates.find((u) => u.status === 'active')!;
    expect(statusEvent.files).toHaveLength(600);
    expect(statusEvent.filesOmitted).toBeFalsy();

    const before = updates.length;
    peer.write(encodeControlFrame(FrameType.FILE_START, { index: 0, offset: 0 }));
    for (let i = 0; i < 100; i++) peer.write(dataFrame(2));
    await settle(150);

    const progress = updates.slice(before);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((u) => u.filesOmitted === true && u.files.length === 0)).toBe(true);
  });

  it('keeps sending the per-file array for ordinary small transfers', async () => {
    const h = createHarness({ isTrusted: () => true });
    await h.service.start();
    const updates: TransferSnapshot[] = [];
    h.service.events.on('updated', (t) => updates.push(t));

    const peer = h.acceptConnection(createSocketPair(), PEER_FP);
    peer.write(helloFrame('peer'));
    peer.write(
      encodeControlFrame(FrameType.OFFER, {
        transferId: 'tx-small',
        items: [{ index: 0, relPath: 'a.bin', kind: 'file', size: 100, mtimeMs: 1 }],
        totalBytes: 100,
        fileCount: 1,
      }),
    );
    await settle();
    const before = updates.length;
    peer.write(encodeControlFrame(FrameType.FILE_START, { index: 0, offset: 0 }));
    peer.write(dataFrame(10));
    await settle(150);

    expect(updates.slice(before).every((u) => u.filesOmitted !== true)).toBe(true);
  });
});
