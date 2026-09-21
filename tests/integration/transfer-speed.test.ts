import { describe, it, expect } from 'vitest';
import { createHarness } from '../fakes/service-harness';
import { createSocketPair } from '../fakes/socket-pair';
import { testHello } from '../fakes/hello';
import { FrameType, encodeControlFrame } from '../../src/shared/protocol';
import type { TransferSnapshot } from '../../src/shared/types';

const PEER_FP = 'peer-fingerprint-abc';

/**
 * Regression coverage: TransferSnapshot.speedBps was hard-coded to 0 and
 * stats.recordThroughput() was never called from anywhere, so the transfer bar
 * permanently read "0 MB/s" and no ETA was ever shown.
 */
describe('transfer speed reporting', () => {
  it('reports a live speed and ETA while bytes are flowing', async () => {
    // Trusted, so the offer is auto-accepted and data starts flowing at once.
    const h = createHarness({ isTrusted: (fp) => fp === PEER_FP });
    await h.service.start();

    const updates: TransferSnapshot[] = [];
    h.service.events.on('updated', (t) => updates.push({ ...t }));

    const peer = h.acceptConnection(createSocketPair(), PEER_FP);
    peer.write(encodeControlFrame(FrameType.HELLO, { ...testHello('peer'), protocolVersion: 1 }));
    peer.write(
      encodeControlFrame(FrameType.OFFER, {
        transferId: 'tx-speed',
        items: [{ index: 0, relPath: 'a.bin', kind: 'file', size: 400_000, mtimeMs: 1 }],
        totalBytes: 400_000,
        fileCount: 1,
      }),
    );
    await new Promise((r) => setTimeout(r, 20));

    peer.write(encodeControlFrame(FrameType.FILE_START, { index: 0, offset: 0 }));
    // Two bursts, separated in time, so there is a real elapsed interval to
    // measure a rate over.
    const burst = Buffer.alloc(100_000, 1);
    const header = Buffer.alloc(5);
    header.writeUInt8(FrameType.DATA, 0);
    header.writeUInt32BE(burst.length, 1);
    peer.write(Buffer.concat([header, burst]));
    await new Promise((r) => setTimeout(r, 60));
    peer.write(Buffer.concat([header, burst]));
    await new Promise((r) => setTimeout(r, 40));

    const latest = updates[updates.length - 1];
    expect(latest.bytesDone).toBe(200_000);
    expect(latest.speedBps).toBeGreaterThan(0);
    expect(latest.etaSeconds).toBeGreaterThan(0);
  });
});
