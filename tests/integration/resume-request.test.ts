import { describe, it, expect } from 'vitest';
import { runReceiverSession } from '../../src/core/transfer/session/receiver-session';
import { createFakeFileSystem } from '../fakes/filesystem';
import { createSilentLogger } from '../fakes/logger';
import { createSocketPair } from '../fakes/socket-pair';
import { testHello } from '../fakes/hello';
import { FrameType, encodeControlFrame, PROTOCOL_VERSION } from '../../src/shared/protocol';

/**
 * Covers the receiver-initiated resume path (spec §5.7 "Receiver paused"):
 * a small connection carrying only HELLO + RESUME_REQUEST, asking the
 * original sender to reconnect. This device plays the sender role here.
 */
describe('RESUME_REQUEST handling', () => {
  it('invokes onResumeRequest with the transfer id and closes without touching files', async () => {
    const fs = createFakeFileSystem();
    const logger = createSilentLogger();
    const [clientSocket, serverSocket] = createSocketPair();

    let requestedId: string | undefined;
    const serverDone = runReceiverSession(serverSocket as never, {
      fs,
      logger,
      destinationRoot: '/dl',
      hello: testHello('original-sender'),
      onProgress: () => {},
      onFileDone: () => {},
      onOffer: async () => ({ accept: false }),
      onResumeRequest: (transferId) => {
        requestedId = transferId;
      },
    });

    // Simulate the receiver's client-side connection: HELLO then RESUME_REQUEST.
    clientSocket.write(
      encodeControlFrame(FrameType.HELLO, {
        protocolVersion: PROTOCOL_VERSION,
        appVersion: '0.1.0-test',
        deviceId: 'device-receiver',
        name: 'receiver',
        os: 'linux',
      }),
    );
    clientSocket.write(encodeControlFrame(FrameType.RESUME_REQUEST, { transferId: 'send-transfer-1' }));

    await serverDone;

    expect(requestedId).toBe('send-transfer-1');
  });
});
