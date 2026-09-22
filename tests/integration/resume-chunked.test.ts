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
 * Regression coverage: on a resume the sender rebuilds the hash of the bytes
 * the receiver already has, but that loop never decremented the offset and
 * only stopped when a single read chunk was as long as the whole offset. With
 * real 64 KiB reads it therefore read and hashed the ENTIRE file, got a hash
 * of the wrong bytes, and the receiver answered FILE_RETRY - so every resume
 * of a file larger than one chunk silently restarted from zero. The fake
 * filesystem hid it by returning each file as a single chunk.
 */
describe('resuming with realistic read chunks', () => {
  it('verifies on the first attempt and sends only the remaining bytes', async () => {
    const CHUNK = 64 * 1024;
    const senderFs = createFakeFileSystem({ readChunkSize: CHUNK });
    const receiverFs = createFakeFileSystem({ readChunkSize: CHUNK });
    const logger = createSilentLogger();

    const size = 20 * CHUNK + 1234;
    const content = Buffer.alloc(size);
    for (let i = 0; i < size; i++) content[i] = (i * 31) % 251;
    const w = await senderFs.openWrite('/src/big.bin', {});
    await w.write(content);
    await w.close();
    const stat = await senderFs.stat('/src/big.bin');
    const items: TransferItem[] = [{ index: 0, relPath: 'big.bin', kind: 'file', size, mtimeMs: stat!.mtimeMs }];

    // A previous connection already landed 7.5 chunks.
    const already = Math.floor(7.5 * CHUNK);
    const partial = await receiverFs.openWrite(path.resolve('/dl', 'big.bin') + '.etpart', {});
    await partial.write(content.subarray(0, already));
    await partial.close();

    const [senderSocket, receiverSocket] = createSocketPair();
    let fileOk = false;
    let sentBytes = 0;
    let retries = 0;
    receiverSocket.on('data', () => undefined);
    const origWrite = receiverSocket.write.bind(receiverSocket);
    receiverSocket.write = (chunk: Buffer) => {
      if (chunk.readUInt8(0) === 0x14 /* FILE_RETRY */) retries += 1;
      return origWrite(chunk);
    };

    await Promise.all([
      runReceiverSession(receiverSocket as never, {
        fs: receiverFs, logger, destinationRoot: '/dl', hello: testHello('receiver'),
        onProgress: () => {}, onFileDone: (_i, ok) => (fileOk = ok),
        onOffer: async () => ({ accept: false }),
        onResume: async () => ({ items, destinationRoot: '/dl' }),
      }),
      runSenderSession(senderSocket as never, {
        fs: senderFs, logger, transferId: 'r', hello: testHello('sender'), items, resume: true,
        sourceOf: () => ({ item: items[0], absolutePath: '/src/big.bin' }),
        onProgress: (_i, delta) => (sentBytes += delta),
        onFileDone: () => {},
      }),
    ]);

    expect(retries).toBe(0);
    expect(fileOk).toBe(true);
    expect(sentBytes).toBe(size - already);
    const finalKey = path.resolve('/dl', 'big.bin').split(String.fromCharCode(92)).join('/');
    const landed = Buffer.from(receiverFs._dump()[finalKey], 'latin1');
    expect(landed.length).toBe(size);
  });
});
