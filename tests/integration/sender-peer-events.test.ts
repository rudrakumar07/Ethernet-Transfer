import { describe, it, expect } from 'vitest';
import { runSenderSession } from '../../src/core/transfer/session/sender-session';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createSilentLogger } from '../fakes/logger';
import { createSocketPair, type FakeSocket } from '../fakes/socket-pair';
import { helloFrame, testHello } from '../fakes/hello';
import { FrameType, encodeControlFrame } from '../../src/shared/protocol';
import type { TransferItem } from '../../src/shared/types';

const CHUNK = 64 * 1024;

async function setup(fileCount: number) {
  const fs = createFakeFileSystem({ readChunkSize: CHUNK });
  const items: TransferItem[] = [];
  for (let i = 0; i < fileCount; i++) {
    const w = await fs.openWrite(`/src/f${i}.bin`, {});
    await w.write(Buffer.alloc(8 * CHUNK, i));
    await w.close();
    items.push({ index: i, relPath: `f${i}.bin`, kind: 'file', size: 8 * CHUNK, mtimeMs: 1 });
  }
  const [sender, peer] = createSocketPair({ highWaterMark: 2 * CHUNK, manualFlush: true });
  const failed: number[] = [];
  const verified: number[] = [];
  const flusher = setInterval(() => sender.flushWrites(), 1);
  const run = (onPeerData: (type: number, peer: FakeSocket) => void) => {
    peer.on('data', (c: Buffer) => {
      if (c.length < 5) return;
      const type = c.readUInt8(0);
      if (type === FrameType.HELLO) peer.write(helloFrame('peer'));
      else if (type === FrameType.OFFER) peer.write(encodeControlFrame(FrameType.ACCEPT, { offsets: {} }));
      else onPeerData(type, peer);
    });
    return runSenderSession(sender as never, {
      fs,
      logger: createSilentLogger(),
      transferId: 't',
      items,
      hello: testHello('me'),
      sourceOf: (i) => ({ item: items[i], absolutePath: `/src/f${i}.bin` }),
      onProgress: () => {},
      onFileDone: (i, ok) => (ok ? verified : failed).push(i),
    }).finally(() => clearInterval(flusher));
  };
  return { run, failed, verified };
}

const withTimeout = <T>(p: Promise<T>, ms = 3000) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('session hung')), ms))]);

/**
 * Regression coverage: the sender only read from the peer after each file, and
 * treated any failure to read as a failed file. A dropped connection therefore
 * marked the file failed, moved on, and waited forever for 'drain' on a dead
 * socket; a PAUSE or CANCEL from the receiver was recorded as a hash mismatch.
 */
describe('sender reacting to the receiver', () => {
  it('stops cleanly, without failing files, when the connection drops mid-file', async () => {
    const s = await setup(3);
    let dataSeen = 0;
    const outcome = await withTimeout(
      s.run((type, peer) => {
        if (type === FrameType.DATA && ++dataSeen === 3) peer.destroy();
      }),
    );
    expect(outcome).toBe('connection-lost');
    expect(s.failed).toEqual([]);
  });

  it('reports a pause from the receiver instead of a failed file', async () => {
    const s = await setup(2);
    let dataSeen = 0;
    const outcome = await withTimeout(
      s.run((type, peer) => {
        if (type === FrameType.DATA && ++dataSeen === 2) {
          peer.write(encodeControlFrame(FrameType.PAUSE, {}));
          peer.end();
        }
      }),
    );
    expect(outcome).toBe('peer-paused');
    expect(s.failed).toEqual([]);
  });

  it('reports a cancel from the receiver', async () => {
    const s = await setup(2);
    const outcome = await withTimeout(
      s.run((type, peer) => {
        if (type === FrameType.FILE_END) {
          peer.write(encodeControlFrame(FrameType.CANCEL, {}));
          peer.end();
        }
      }),
    );
    expect(outcome).toBe('peer-cancelled');
    expect(s.failed).toEqual([]);
  });

  it('still finishes normally when the receiver confirms every file', async () => {
    const s = await setup(2);
    const outcome = await withTimeout(
      s.run((type, peer) => {
        if (type === FrameType.FILE_END) peer.write(encodeControlFrame(FrameType.FILE_OK, { index: s.verified.length }));
      }),
    );
    expect(outcome).toBe('finished');
    expect(s.verified).toEqual([0, 1]);
  });

  it('notices a cancel at once even while waiting for a full send buffer to drain', async () => {
    const fs = createFakeFileSystem({ readChunkSize: CHUNK });
    const w = await fs.openWrite('/src/big.bin', {});
    await w.write(Buffer.alloc(64 * CHUNK, 1));
    await w.close();
    const items: TransferItem[] = [{ index: 0, relPath: 'big.bin', kind: 'file', size: 64 * CHUNK, mtimeMs: 1 }];
    const [sender, peer] = createSocketPair({ highWaterMark: 2 * CHUNK, manualFlush: true });

    // The link stalls the moment data starts flowing: nothing drains any more,
    // so the sender sits waiting on 'drain' when the receiver cancels.
    let stalled = false;
    const flusher = setInterval(() => { if (!stalled) sender.flushWrites(); }, 1);
    peer.on('data', (c: Buffer) => {
      const type = c.readUInt8(0);
      if (type === FrameType.HELLO) peer.write(helloFrame('peer'));
      if (type === FrameType.OFFER) peer.write(encodeControlFrame(FrameType.ACCEPT, { offsets: {} }));
      if (type === FrameType.DATA && !stalled) {
        stalled = true;
        setTimeout(() => peer.write(encodeControlFrame(FrameType.CANCEL, {})), 20);
      }
    });

    const started = Date.now();
    const outcome = await withTimeout(
      runSenderSession(sender as never, {
        fs, logger: createSilentLogger(), transferId: 't', items, hello: testHello('me'),
        sourceOf: () => ({ item: items[0], absolutePath: '/src/big.bin' }),
        onProgress: () => {}, onFileDone: () => {},
      }),
      1500,
    ).finally(() => clearInterval(flusher));

    expect(outcome).toBe('peer-cancelled');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
