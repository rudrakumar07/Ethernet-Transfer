import { describe, it, expect } from 'vitest';
import { createHarness } from '../fakes/service-harness';
import { createSocketPair } from '../fakes/socket-pair';
import { helloFrame } from '../fakes/hello';
import { FrameType, encodeControlFrame } from '../../src/shared/protocol';

const PEER_FP = 'peer-fingerprint-abc';
const settle = () => new Promise((r) => setTimeout(r, 30));

function dataFrame(bytes: number): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt8(FrameType.DATA, 0);
  header.writeUInt32BE(bytes, 1);
  return Buffer.concat([header, Buffer.alloc(bytes, 1)]);
}

/**
 * Regression coverage from a real pause/resume of a 200 MiB file: the sender
 * ended up reporting 419 MB done out of 209 MB total and the receiver 606 MB,
 * because bytesDone was a running accumulator that re-counted every resumed
 * byte range - plus FILE_START added its whole offset on top of what had
 * already been counted.
 */
describe('progress accounting across a resume', () => {
  it('never reports more bytes done than the transfer contains', async () => {
    const h = createHarness({ isTrusted: () => true });
    await h.service.start();

    const peer = h.acceptConnection(createSocketPair(), PEER_FP);
    peer.write(helloFrame('peer'));
    peer.write(
      encodeControlFrame(FrameType.OFFER, {
        transferId: 'tx-progress',
        items: [{ index: 0, relPath: 'a.bin', kind: 'file', size: 100, mtimeMs: 1 }],
        totalBytes: 100,
        fileCount: 1,
      }),
    );
    await settle();

    peer.write(encodeControlFrame(FrameType.FILE_START, { index: 0, offset: 0 }));
    peer.write(dataFrame(40));
    await settle();

    const afterFirst = h.service.list().find((t) => t.id === 'tx-progress')!;
    expect(afterFirst.bytesDone).toBe(40);

    // The file restarts from where it left off, as a resume does. The offset is
    // an absolute position, not 40 more bytes on top of the 40 already counted.
    peer.write(encodeControlFrame(FrameType.FILE_START, { index: 0, offset: 40 }));
    await settle();

    const afterResume = h.service.list().find((t) => t.id === 'tx-progress')!;
    expect(afterResume.bytesDone).toBe(40);

    peer.write(dataFrame(60));
    await settle();

    const afterRest = h.service.list().find((t) => t.id === 'tx-progress')!;
    expect(afterRest.bytesDone).toBe(100);
    expect(afterRest.bytesDone).toBeLessThanOrEqual(afterRest.totalBytes);
  });
});
