import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { runSenderSession } from '../../src/core/transfer/session/sender-session';
import { runReceiverSession } from '../../src/core/transfer/session/receiver-session';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createSilentLogger } from '../fakes/logger';
import { testHello } from '../fakes/hello';
import { createSocketPair } from '../fakes/socket-pair';
import type { TransferItem } from '../../src/shared/types';

/**
 * Regression test for the bug caught during review: resuming/retrying a
 * multi-file transfer used to re-send EVERY file including ones already
 * verified in a prior attempt, producing a "name (1).ext" duplicate on the
 * receiver instead of skipping them.
 */
describe('sender-session alreadyVerified', () => {
  it('skips files already verified, sending only the remaining one', async () => {
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();

    for (const name of ['done.txt', 'pending.txt']) {
      const w = await senderFs.openWrite(`/src/${name}`, {});
      await w.write(Buffer.from(`contents of ${name}`));
      await w.close();
    }

    const items: TransferItem[] = [
      { index: 0, relPath: 'done.txt', kind: 'file', size: (await senderFs.stat('/src/done.txt'))!.size, mtimeMs: 1 },
      {
        index: 1,
        relPath: 'pending.txt',
        kind: 'file',
        size: (await senderFs.stat('/src/pending.txt'))!.size,
        mtimeMs: 1,
      },
    ];

    // Simulate "done.txt" already having landed correctly on a prior attempt.
    const donePath = path.resolve('/dl', 'done.txt');
    const w = await receiverFs.openWrite(donePath, {});
    await w.write(Buffer.from('contents of done.txt'));
    await w.close();

    const [senderSocket, receiverSocket] = createSocketPair();
    const startedIndices: number[] = [];

    const receiverDone = runReceiverSession(receiverSocket as never, {
      fs: receiverFs,
      logger,
      destinationRoot: '/dl',
      hello: testHello('receiver'),
      onProgress: (index) => startedIndices.push(index),
      onFileDone: () => {},
      onOffer: async () => ({ accept: false }),
      onResume: async () => ({ items, destinationRoot: '/dl' }),
    });

    const senderDone = runSenderSession(senderSocket as never, {
      fs: senderFs,
      logger,
      transferId: 'skip-verified-1',
      hello: testHello('sender'),
      items,
      resume: true,
      alreadyVerified: new Set([0]),
      sourceOf: (i) => ({ item: items[i], absolutePath: `/src/${items[i].relPath}` }),
      onProgress: () => {},
      onFileDone: () => {},
    });

    await Promise.all([senderDone, receiverDone]);

    // Only file 1 (pending.txt) was ever touched on the wire.
    expect(new Set(startedIndices)).toEqual(new Set([1]));
    // done.txt was never re-sent, so no "(1)" duplicate was created.
    expect(await receiverFs.exists(donePath)).toBe(true);
    expect(await receiverFs.exists(path.resolve('/dl', 'done (1).txt'))).toBe(false);
    expect(await receiverFs.exists(path.resolve('/dl', 'pending.txt'))).toBe(true);
  });
});
