import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { runSenderSession } from '../../src/core/transfer/session/sender-session';
import { runReceiverSession } from '../../src/core/transfer/session/receiver-session';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createSilentLogger } from '../fakes/logger';
import { createSocketPair } from '../fakes/socket-pair';
import type { TransferItem } from '../../src/shared/types';

/**
 * Tests the RESUME half of the protocol (spec §5.7) directly: a receiver
 * that already has a partial `.etpart` file on disk (as if a previous
 * connection had died mid-stream — that live-interruption path is exercised
 * by hand-testing per spec §9.5, not simulated here) reports its real offset
 * from disk, and the sender continues or restarts accordingly.
 */
describe('resume protocol', () => {
  it('continues from the receiver-reported offset when the source is unchanged', async () => {
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();

    const content = Buffer.from('A'.repeat(50) + 'B'.repeat(50)); // 100 bytes
    const w = await senderFs.openWrite('/src/big.bin', {});
    await w.write(content);
    await w.close();
    const srcStat = await senderFs.stat('/src/big.bin');

    const items: TransferItem[] = [
      { index: 0, relPath: 'big.bin', kind: 'file', size: srcStat!.size, mtimeMs: srcStat!.mtimeMs },
    ];

    // Simulate a previous connection having already landed the first 60 bytes.
    const partPath = path.resolve('/dl', 'big.bin') + '.etpart';
    const partial = await receiverFs.openWrite(partPath, {});
    await partial.write(content.subarray(0, 60));
    await partial.close();

    const [senderSocket, receiverSocket] = createSocketPair();
    let fileOk = false;

    const receiverDone = runReceiverSession(receiverSocket as never, {
      fs: receiverFs,
      logger,
      destinationRoot: '/dl',
      onProgress: () => {},
      onFileDone: (_i, ok) => (fileOk = ok),
      onOffer: async () => ({ accept: false }),
      onResume: async () => ({ items, destinationRoot: '/dl' }),
    });

    const senderDone = runSenderSession(senderSocket as never, {
      fs: senderFs,
      logger,
      transferId: 'resume-1',
      items,
      sourceOf: () => ({ item: items[0], absolutePath: '/src/big.bin' }),
      onProgress: () => {},
      onFileDone: () => {},
      resume: true,
    });

    await Promise.all([senderDone, receiverDone]);

    expect(fileOk).toBe(true);
    const finalPath = path.resolve('/dl', 'big.bin').replace(/\\/g, '/');
    const finalContent = receiverFs._dump()[finalPath];
    expect(finalContent).toBeDefined();
    const finalBuffer = Buffer.from(finalContent, 'utf8');
    expect(finalBuffer.length).toBe(content.length);
    expect(createHash('sha256').update(finalBuffer).digest('hex')).toBe(
      createHash('sha256').update(content).digest('hex'),
    );
  });

  it('restarts from zero when the source file changed since the pause', async () => {
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();

    const originalContent = Buffer.from('original-bytes');
    const w = await senderFs.openWrite('/src/changed.txt', {});
    await w.write(originalContent);
    await w.close();
    const originalStat = await senderFs.stat('/src/changed.txt');

    // The item descriptor captures size/mtime as of when the offer was made.
    const items: TransferItem[] = [
      { index: 0, relPath: 'changed.txt', kind: 'file', size: originalStat!.size, mtimeMs: originalStat!.mtimeMs },
    ];

    // The source changes before resume - simulating the user editing the
    // file while the transfer was paused.
    const newContent = Buffer.from('a completely different and longer payload');
    const w2 = await senderFs.openWrite('/src/changed.txt', {});
    await w2.write(newContent);
    await w2.close();

    // Pretend 5 bytes of the OLD content already landed on disk before the pause.
    const partPath = path.resolve('/dl', 'changed.txt') + '.etpart';
    const partial = await receiverFs.openWrite(partPath, {});
    await partial.write(originalContent.subarray(0, 5));
    await partial.close();

    const [senderSocket, receiverSocket] = createSocketPair();
    const receiverDone = runReceiverSession(receiverSocket as never, {
      fs: receiverFs,
      logger,
      destinationRoot: '/dl',
      onProgress: () => {},
      onFileDone: () => {},
      onOffer: async () => ({ accept: false }),
      onResume: async () => ({ items, destinationRoot: '/dl' }),
    });
    const senderDone = runSenderSession(senderSocket as never, {
      fs: senderFs,
      logger,
      transferId: 'resume-2',
      items,
      sourceOf: () => ({ item: items[0], absolutePath: '/src/changed.txt' }),
      onProgress: () => {},
      onFileDone: () => {},
      resume: true,
    });

    await Promise.all([senderDone, receiverDone]);

    const finalPath = path.resolve('/dl', 'changed.txt').replace(/\\/g, '/');
    const finalContent = receiverFs._dump()[finalPath];
    // Restarted from zero means the full NEW content landed, not old+tail.
    expect(Buffer.from(finalContent, 'utf8').equals(newContent)).toBe(true);
  });
});
