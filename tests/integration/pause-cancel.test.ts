import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { runSenderSession } from '../../src/core/transfer/session/sender-session';
import { runReceiverSession } from '../../src/core/transfer/session/receiver-session';
import { createSessionControl } from '../../src/core/transfer/session/control';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createSilentLogger } from '../fakes/logger';
import { testHello } from '../fakes/hello';
import { createSocketPair } from '../fakes/socket-pair';
import type { TransferItem } from '../../src/shared/types';

/**
 * Regression tests for the bug caught during review: Pause and Cancel used
 * to only change the displayed status while the sender kept writing bytes
 * and the receiver kept accepting them. These prove the SessionControl
 * plumbing actually halts the byte flow.
 */
describe('pause/cancel actually stop the transfer', () => {
  it('cancelling after the first of two files skips the second entirely', async () => {
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();
    const control = createSessionControl();

    for (const name of ['first.txt', 'second.txt']) {
      const w = await senderFs.openWrite(`/src/${name}`, {});
      await w.write(Buffer.from(`contents of ${name}`));
      await w.close();
    }

    const items: TransferItem[] = [
      { index: 0, relPath: 'first.txt', kind: 'file', size: (await senderFs.stat('/src/first.txt'))!.size, mtimeMs: 1 },
      { index: 1, relPath: 'second.txt', kind: 'file', size: (await senderFs.stat('/src/second.txt'))!.size, mtimeMs: 1 },
    ];

    const [senderSocket, receiverSocket] = createSocketPair();
    const doneIndices: number[] = [];

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
      transferId: 'cancel-1',
      hello: testHello('sender'),
      items,
      control,
      sourceOf: (i) => ({ item: items[i], absolutePath: `/src/${items[i].relPath}` }),
      onProgress: () => {},
      onFileDone: (index, ok) => {
        doneIndices.push(index);
        if (ok && index === 0) control.requestCancel(); // cancel right after file 0 completes
      },
    });

    await Promise.all([senderDone, receiverDone]);

    expect(doneIndices).toEqual([0]); // file 1 was never even attempted
    expect(await receiverFs.exists(path.resolve('/dl', 'first.txt'))).toBe(true);
    expect(await receiverFs.exists(path.resolve('/dl', 'second.txt'))).toBe(false);
  });

  it('pausing before any file starts sends no data and ends the connection', async () => {
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();
    const control = createSessionControl();

    const w = await senderFs.openWrite('/src/only.txt', {});
    await w.write(Buffer.from('should never arrive'));
    await w.close();

    const items: TransferItem[] = [{ index: 0, relPath: 'only.txt', kind: 'file', size: 20, mtimeMs: 1 }];
    const [senderSocket, receiverSocket] = createSocketPair();
    let onFileDoneCalled = false;

    const receiverDone = runReceiverSession(receiverSocket as never, {
      fs: receiverFs,
      logger,
      destinationRoot: '/dl',
      hello: testHello('receiver'),
      onProgress: () => {},
      onFileDone: () => {
        onFileDoneCalled = true;
      },
      onOffer: async () => {
        // Pause fires the instant the offer is accepted, before FILE_START.
        control.requestPause();
        return { accept: true, offsets: {} };
      },
    });

    const senderDone = runSenderSession(senderSocket as never, {
      fs: senderFs,
      logger,
      transferId: 'pause-1',
      hello: testHello('sender'),
      items,
      control,
      sourceOf: (i) => ({ item: items[i], absolutePath: '/src/only.txt' }),
      onProgress: () => {},
      onFileDone: () => {},
    });

    await Promise.all([senderDone, receiverDone]);

    expect(onFileDoneCalled).toBe(false);
    expect(await receiverFs.exists(path.resolve('/dl', 'only.txt'))).toBe(false);
    expect(await receiverFs.exists(path.resolve('/dl', 'only.txt') + '.etpart')).toBe(false);
  });

  it('cancelling from the receiver side deletes the partial file', async () => {
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();
    const receiverControl = createSessionControl();

    const content = Buffer.from('x'.repeat(200));
    const w = await senderFs.openWrite('/src/big.bin', {});
    await w.write(content);
    await w.close();

    const items: TransferItem[] = [{ index: 0, relPath: 'big.bin', kind: 'file', size: content.length, mtimeMs: 1 }];
    const [senderSocket, receiverSocket] = createSocketPair();

    const receiverDone = runReceiverSession(receiverSocket as never, {
      fs: receiverFs,
      logger,
      destinationRoot: '/dl',
      hello: testHello('receiver'),
      control: receiverControl,
      onProgress: (index, delta) => {
        // Cancel partway through receiving, from the receiver's own side.
        if (delta > 0) receiverControl.requestCancel();
      },
      onFileDone: () => {},
      onOffer: async () => ({ accept: true, offsets: {} }),
    });

    const senderDone = runSenderSession(senderSocket as never, {
      fs: senderFs,
      logger,
      transferId: 'cancel-2',
      hello: testHello('sender'),
      items,
      sourceOf: () => ({ item: items[0], absolutePath: '/src/big.bin' }),
      onProgress: () => {},
      onFileDone: () => {},
    });

    await Promise.all([senderDone, receiverDone]);

    expect(await receiverFs.exists(path.resolve('/dl', 'big.bin'))).toBe(false);
    expect(await receiverFs.exists(path.resolve('/dl', 'big.bin') + '.etpart')).toBe(false);
  });
});
