import { describe, it, expect } from 'vitest';
import { runSenderSession } from '../../src/core/transfer/session/sender-session';
import { runReceiverSession } from '../../src/core/transfer/session/receiver-session';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createSilentLogger } from '../fakes/logger';
import { createSocketPair } from '../fakes/socket-pair';
import { testHello } from '../fakes/hello';
import { FrameType, encodeControlFrame, PROTOCOL_VERSION } from '../../src/shared/protocol';
import type { TransferItem } from '../../src/shared/types';

/**
 * Regression coverage for the spec §5.2-§5.3 HELLO handshake, which the
 * initial implementation skipped entirely (sender jumped straight to OFFER).
 */
describe('HELLO handshake', () => {
  it('exchanges HELLO before OFFER, and the transfer still completes', async () => {
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();
    const [senderSocket, receiverSocket] = createSocketPair();

    const content = Buffer.from('after the handshake');
    const w = await senderFs.openWrite('/src/a.txt', {});
    await w.write(content);
    await w.close();
    const items: TransferItem[] = [{ index: 0, relPath: 'a.txt', kind: 'file', size: content.length, mtimeMs: 1 }];

    let fileOk = false;
    const receiverDone = runReceiverSession(receiverSocket as never, {
      fs: receiverFs,
      logger,
      destinationRoot: '/dl',
      hello: testHello('receiver'),
      onProgress: () => {},
      onFileDone: (_i, ok) => (fileOk = ok),
      onOffer: async () => ({ accept: true, offsets: {} }),
    });

    const senderDone = runSenderSession(senderSocket as never, {
      fs: senderFs,
      logger,
      transferId: 'hs-1',
      hello: testHello('sender'),
      items,
      sourceOf: () => ({ item: items[0], absolutePath: '/src/a.txt' }),
      onProgress: () => {},
      onFileDone: () => {},
    });

    await Promise.all([senderDone, receiverDone]);
    expect(fileOk).toBe(true);
  });

  it('rejects an incompatible protocol version and reports it, without transferring anything', async () => {
    const senderFs = createFakeFileSystem();
    const receiverFs = createFakeFileSystem();
    const logger = createSilentLogger();
    const [senderSocket, receiverSocket] = createSocketPair();

    const items: TransferItem[] = [{ index: 0, relPath: 'a.txt', kind: 'file', size: 5, mtimeMs: 1 }];
    let onOfferCalled = false;
    let reportedVersion: string | undefined;

    // The receiver in this test speaks a future major protocol version.
    const realWrite = receiverSocket.write.bind(receiverSocket);
    receiverSocket.write = (chunk: Buffer) => {
      if (chunk[0] === FrameType.HELLO) {
        const bumped = encodeControlFrame(FrameType.HELLO, {
          protocolVersion: PROTOCOL_VERSION + 1,
          appVersion: '99.0.0',
          deviceId: 'future-device',
          name: 'Future Device',
          os: 'linux',
        });
        return realWrite(bumped);
      }
      return realWrite(chunk);
    };

    const receiverDone = runReceiverSession(receiverSocket as never, {
      fs: receiverFs,
      logger,
      destinationRoot: '/dl',
      hello: testHello('receiver'),
      onProgress: () => {},
      onFileDone: () => {},
      onOffer: async () => {
        onOfferCalled = true;
        return { accept: true, offsets: {} };
      },
    });

    const senderDone = runSenderSession(senderSocket as never, {
      fs: senderFs,
      logger,
      transferId: 'hs-2',
      hello: testHello('sender'),
      items,
      sourceOf: () => ({ item: items[0], absolutePath: '/src/a.txt' }),
      onProgress: () => {},
      onFileDone: () => {},
      onIncompatibleVersion: (v) => (reportedVersion = v),
    });

    await Promise.all([senderDone, receiverDone]);

    expect(onOfferCalled).toBe(false);
    expect(reportedVersion).toBe('99.0.0');
  });
});
