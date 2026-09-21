import { describe, it, expect } from 'vitest';
import { createHarness } from '../fakes/service-harness';
import { createSocketPair } from '../fakes/socket-pair';
import { testHello } from '../fakes/hello';
import { FrameType, encodeControlFrame } from '../../src/shared/protocol';

const PEER_FP = 'peer-fingerprint-abc';
const settle = () => new Promise((r) => setTimeout(r, 20));

/**
 * Regression coverage: "Always accept from this device" stored the offer's
 * deviceId (a UUID) in the fingerprint field, so trust.isTrusted(fingerprint)
 * could never match afterwards and the box silently did nothing.
 */
describe('trusting a device from the offer prompt', () => {
  it('records the peer certificate fingerprint, not the device id', async () => {
    const h = createHarness();
    await h.service.start();

    let offerId = '';
    h.service.events.on('offerIncoming', (o) => {
      offerId = o.offerId;
    });

    const peer = h.acceptConnection(createSocketPair(), PEER_FP);
    peer.write(encodeControlFrame(FrameType.HELLO, { ...testHello('peer'), protocolVersion: 1 }));
    peer.write(
      encodeControlFrame(FrameType.OFFER, {
        transferId: 'tx-1',
        items: [{ index: 0, relPath: 'a.bin', kind: 'file', size: 4, mtimeMs: 1 }],
        totalBytes: 4,
        fileCount: 1,
      }),
    );
    await settle();

    expect(offerId).not.toBe('');
    await h.service.respondToOffer(offerId, true, true);

    expect(h.trusted).toEqual([PEER_FP]);
  });

  it('auto-accepts a trusted peer without prompting', async () => {
    const h = createHarness({ isTrusted: (fp) => fp === PEER_FP });
    await h.service.start();

    let prompted = false;
    h.service.events.on('offerIncoming', () => {
      prompted = true;
    });

    const peer = h.acceptConnection(createSocketPair(), PEER_FP);
    const fromService: number[] = [];
    peer.on('data', (c: Buffer) => fromService.push(c.readUInt8(0)));

    peer.write(encodeControlFrame(FrameType.HELLO, { ...testHello('peer'), protocolVersion: 1 }));
    peer.write(
      encodeControlFrame(FrameType.OFFER, {
        transferId: 'tx-2',
        items: [{ index: 0, relPath: 'a.bin', kind: 'file', size: 4, mtimeMs: 1 }],
        totalBytes: 4,
        fileCount: 1,
      }),
    );
    await settle();

    expect(prompted).toBe(false);
    expect(fromService).toContain(FrameType.ACCEPT);
  });
});
