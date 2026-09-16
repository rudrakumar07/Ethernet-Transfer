import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { runSenderSession } from '../../src/core/transfer/session/sender-session';
import { runReceiverSession } from '../../src/core/transfer/session/receiver-session';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createSilentLogger } from '../fakes/logger';
import { testHello } from '../fakes/hello';
import { createSocketPair } from '../fakes/socket-pair';
import type { TransferItem } from '../../src/shared/types';

/**
 * End-to-end protocol tests: two sessions talk over an in-process socket
 * pair with an in-memory filesystem on each side, no real network or disk.
 */
describe('sender/receiver protocol', () => {
  it('transfers a single small file and verifies its hash', async () => {
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();
    const [senderSocket, receiverSocket] = createSocketPair();

    const content = Buffer.from('hello world');
    await senderFs.writeJsonAtomic('/src/a.txt', null); // ensure dir tracked (not used)
    const writeStream = await senderFs.openWrite('/src/a.txt', {});
    await writeStream.write(content);
    await writeStream.close();

    const items: TransferItem[] = [{ index: 0, relPath: 'a.txt', kind: 'file', size: content.length, mtimeMs: 12345 }];

    const receiverDone = runReceiverSession(receiverSocket as never, {
      fs: receiverFs,
      logger,
      destinationRoot: '/dl',
      hello: testHello('receiver'),
      onProgress: () => {},
      onFileDone: () => {},
      onOffer: async () => ({ accept: true, offsets: {} }),
    });

    const senderDone = runSenderSession(senderSocket as never, {
      fs: senderFs,
      logger,
      transferId: 't1',
      hello: testHello('sender'),
      items,
      sourceOf: (i) => (i === 0 ? { item: items[0], absolutePath: '/src/a.txt' } : undefined),
      onProgress: () => {},
      onFileDone: () => {},
    });

    await Promise.all([senderDone, receiverDone]);

    const stat = await receiverFs.stat(path.resolve('/dl', 'a.txt'));
    expect(stat).not.toBeNull();
    expect(stat?.size).toBe(content.length);
  });

  it('rejects an offer containing a path-traversal item', async () => {
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();
    const [senderSocket, receiverSocket] = createSocketPair();

    const items: TransferItem[] = [{ index: 0, relPath: '../escape.txt', kind: 'file', size: 5, mtimeMs: 1 }];
    let offerCalled = false;

    const receiverDone = runReceiverSession(receiverSocket as never, {
      fs: receiverFs,
      logger,
      destinationRoot: '/dl',
      hello: testHello('receiver'),
      onProgress: () => {},
      onFileDone: () => {},
      onOffer: async () => {
        offerCalled = true;
        return { accept: true };
      },
    });

    const w = await senderFs.openWrite('/src/escape.txt', {});
    await w.write(Buffer.from('hijack'));
    await w.close();

    const senderDone = runSenderSession(senderSocket as never, {
      fs: senderFs,
      logger,
      transferId: 't2',
      hello: testHello('sender'),
      items,
      sourceOf: () => ({ item: items[0], absolutePath: '/src/escape.txt' }),
      onProgress: () => {},
      onFileDone: () => {},
    });

    await Promise.allSettled([senderDone, receiverDone]);

    expect(offerCalled).toBe(false);
    expect(await receiverFs.exists(path.resolve('/', 'escape.txt'))).toBe(false);
  });

  it('retries once on a hash mismatch and then succeeds', async () => {
    // The hash covers bytes as they cross the wire (spec §5.6), so to exercise
    // the mismatch/retry path we corrupt one DATA frame in transit, only on
    // its first send — the sender's declared hash (computed from its own
    // unmodified read) then won't match what the receiver actually received.
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();

    const content = Buffer.from('integrity-check-me');
    const w = await senderFs.openWrite('/src/b.txt', {});
    await w.write(content);
    await w.close();

    const [senderSocket, receiverSocket] = createSocketPair();
    let corruptedOnce = false;
    const realWrite = senderSocket.write.bind(senderSocket);
    senderSocket.write = (chunk: Buffer) => {
      // DATA frames start with type byte 0x11 (FrameType.DATA); corrupt the
      // first byte of its payload exactly once.
      if (!corruptedOnce && chunk[0] === 0x11) {
        corruptedOnce = true;
        const flipped = Buffer.from(chunk);
        flipped[5] = flipped[5] ^ 0xff;
        return realWrite(flipped);
      }
      return realWrite(chunk);
    };

    const items: TransferItem[] = [{ index: 0, relPath: 'b.txt', kind: 'file', size: content.length, mtimeMs: 1 }];
    let fileFailedCount = 0;
    let fileOkCount = 0;

    const receiverDone = runReceiverSession(receiverSocket as never, {
      fs: receiverFs,
      logger,
      destinationRoot: '/dl',
      hello: testHello('receiver'),
      onProgress: () => {},
      onFileDone: (_i, ok) => {
        if (ok) fileOkCount++;
        else fileFailedCount++;
      },
      onOffer: async () => ({ accept: true, offsets: {} }),
    });

    const senderDone = runSenderSession(senderSocket as never, {
      fs: senderFs,
      logger,
      transferId: 't3',
      hello: testHello('sender'),
      items,
      sourceOf: () => ({ item: items[0], absolutePath: '/src/b.txt' }),
      onProgress: () => {},
      onFileDone: () => {},
    });

    await Promise.all([senderDone, receiverDone]);

    expect(corruptedOnce).toBe(true);
    expect(fileOkCount).toBe(1);
    expect(fileFailedCount).toBe(0);
    const finalHash = createHash('sha256').update(content).digest('hex');
    const dumpKey = path.resolve('/dl', 'b.txt').replace(/\\/g, '/');
    const receiverContent = receiverFs._dump()[dumpKey];
    expect(receiverContent).toBeDefined();
    expect(createHash('sha256').update(Buffer.from(receiverContent, 'utf8')).digest('hex')).toBe(finalHash);
  });

  it('declines when onOffer rejects', async () => {
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();
    const [senderSocket, receiverSocket] = createSocketPair();
    const items: TransferItem[] = [{ index: 0, relPath: 'c.txt', kind: 'file', size: 1, mtimeMs: 1 }];
    const w = await senderFs.openWrite('/src/c.txt', {});
    await w.write(Buffer.from('x'));
    await w.close();

    let declinedReason: string | undefined;

    const receiverDone = runReceiverSession(receiverSocket as never, {
      fs: receiverFs,
      logger,
      destinationRoot: '/dl',
      hello: testHello('receiver'),
      onProgress: () => {},
      onFileDone: () => {},
      onOffer: async () => ({ accept: false }),
    });

    const senderDone = runSenderSession(senderSocket as never, {
      fs: senderFs,
      logger,
      transferId: 't4',
      hello: testHello('sender'),
      items,
      sourceOf: () => ({ item: items[0], absolutePath: '/src/c.txt' }),
      onProgress: () => {},
      onFileDone: () => {},
      onDeclined: (reason) => (declinedReason = reason),
    });

    await Promise.all([senderDone, receiverDone]);
    expect(declinedReason).toBe('user');
  });
});
