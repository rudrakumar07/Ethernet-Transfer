import { describe, it, expect } from 'vitest';
import { runSenderSession } from '../../src/core/transfer/session/sender-session';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createSilentLogger } from '../fakes/logger';
import { createSocketPair } from '../fakes/socket-pair';
import { helloFrame, testHello } from '../fakes/hello';
import { FrameType, encodeControlFrame } from '../../src/shared/protocol';
import type { TransferItem } from '../../src/shared/types';

const CHUNK = 64 * 1024;
const HIGH_WATER_MARK = 256 * 1024;

/**
 * Regression coverage for the stall/crash reported over a direct cable: the
 * sender wrote every chunk of a file into the socket without ever checking
 * write()'s return value, so a 2 GiB file was queued into the socket's write
 * buffer in ~11ms. Progress jumped straight to 100% while nothing had actually
 * crossed the wire, FILE_END sat behind gigabytes of backlog, and the buffered
 * bytes could take the core process down with it.
 */
describe('sender backpressure', () => {
  it('waits for drain instead of queueing the whole file into the socket', async () => {
    const fs = createFakeFileSystem({ readChunkSize: CHUNK });
    const fileBytes = 40 * CHUNK; // 2.5 MiB, 10x the socket's high-water mark
    const w = await fs.openWrite('/src/big.bin', {});
    await w.write(Buffer.alloc(fileBytes, 3));
    await w.close();

    const [senderSocket, peer] = createSocketPair({ highWaterMark: HIGH_WATER_MARK, manualFlush: true });

    const item: TransferItem = { index: 0, relPath: 'big.bin', kind: 'file', size: fileBytes, mtimeMs: 1 };

    // The peer plays a well-behaved receiver: HELLO, ACCEPT, then FILE_OK once
    // it sees FILE_END. It never reads eagerly - draining is driven below.
    peer.on('data', (chunk: Buffer) => {
      if (chunk.length >= 5 && chunk.readUInt8(0) === FrameType.HELLO) {
        peer.write(helloFrame('peer'));
      }
      if (chunk.length >= 5 && chunk.readUInt8(0) === FrameType.OFFER) {
        peer.write(encodeControlFrame(FrameType.ACCEPT, { offsets: {} }));
      }
      if (chunk.length >= 5 && chunk.readUInt8(0) === FrameType.FILE_END) {
        peer.write(encodeControlFrame(FrameType.FILE_OK, { index: 0 }));
      }
    });

    let progressBytes = 0;
    const session = runSenderSession(senderSocket as never, {
      fs,
      logger: createSilentLogger(),
      transferId: 't1',
      items: [item],
      hello: testHello('me'),
      sourceOf: () => ({ item, absolutePath: '/src/big.bin' }),
      onProgress: (_i, delta) => {
        progressBytes += delta;
      },
      onFileDone: () => {},
    });

    // Drain in slow, fixed-size bites, the way a real NIC does. If the sender
    // respects backpressure it can never get more than roughly one high-water
    // mark ahead of what has actually been flushed.
    const drainer = setInterval(() => senderSocket.flushWrites(), 1);
    await session;
    clearInterval(drainer);

    expect(progressBytes).toBe(fileBytes);
    expect(senderSocket.peakWritableLength).toBeLessThanOrEqual(HIGH_WATER_MARK + CHUNK + 5);
  });
});
