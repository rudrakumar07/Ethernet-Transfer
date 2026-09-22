import { describe, it, expect } from 'vitest';
import { createHarness } from '../fakes/service-harness';
import { createSocketPair, type FakeSocket } from '../fakes/socket-pair';
import { helloFrame } from '../fakes/hello';
import { FrameType, encodeControlFrame } from '../../src/shared/protocol';
import type { TransferItem } from '../../src/shared/types';
import type { TlsConnection, TlsTransport } from '../../src/core/ports';

const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

/** A connect() that hands out socket pairs and lets the test script the peer. */
function scriptedConnect(onPeer: (peer: FakeSocket) => void) {
  let count = 0;
  const connect: TlsTransport['connect'] = async () => {
    count += 1;
    const [ours, peer] = createSocketPair();
    onPeer(peer);
    return { socket: ours as never, peer: { fingerprint: 'peer-fingerprint-abc' }, close: () => ours.destroy() } as TlsConnection;
  };
  return { connect, connects: () => count };
}

const oneFile: TransferItem[] = [{ index: 0, relPath: 'a.bin', kind: 'file', size: 9, mtimeMs: 1 }];

async function withSource(h: ReturnType<typeof createHarness>) {
  const w = await h.fs.openWrite('/src/a.bin', {});
  await w.write(Buffer.from('123456789'));
  await w.close();
}

describe('transfer lifecycle edge cases', () => {
  it('marks a send interrupted - not "active" forever - when the connection drops', async () => {
    const script = scriptedConnect((peer) => {
      peer.on('data', (c: Buffer) => {
        const type = c.readUInt8(0);
        if (type === FrameType.HELLO) peer.write(helloFrame('peer'));
        if (type === FrameType.OFFER) peer.write(encodeControlFrame(FrameType.ACCEPT, { offsets: {} }));
        if (type === FrameType.DATA) peer.destroy();
      });
    });
    const h = createHarness({ connect: script.connect, items: oneFile });
    await withSource(h);
    const id = await h.service.send('dev-1', ['/src/a.bin']);
    await settle(80);
    const t = h.service.list().find((x) => x.id === id)!;
    expect(t.status).toBe('interrupted');
    expect(t.files[0].status).not.toBe('failed');
  });

  it('marks a send paused when the receiver pauses it', async () => {
    const script = scriptedConnect((peer) => {
      peer.on('data', (c: Buffer) => {
        const type = c.readUInt8(0);
        if (type === FrameType.HELLO) peer.write(helloFrame('peer'));
        if (type === FrameType.OFFER) peer.write(encodeControlFrame(FrameType.ACCEPT, { offsets: {} }));
        if (type === FrameType.FILE_END) {
          peer.write(encodeControlFrame(FrameType.PAUSE, {}));
          peer.end();
        }
      });
    });
    const h = createHarness({ connect: script.connect, items: oneFile });
    await withSource(h);
    const id = await h.service.send('dev-1', ['/src/a.bin']);
    await settle(80);
    expect(h.service.list().find((x) => x.id === id)!.status).toBe('paused');
  });

  it('keeps a transfer cancelled when it was cancelled mid-scan', async () => {
    let release: () => void = () => {};
    const script = scriptedConnect(() => {});
    const h = createHarness({
      connect: script.connect,
      buildFileList: async () => {
        await new Promise<void>((r) => (release = r));
        return Object.assign([...oneFile], { sources: new Map([[0, '/src/a.bin']]) });
      },
    });
    const sending = h.service.send('dev-1', ['/src/big-folder']);
    await settle();
    const id = h.service.list()[0].id;
    await h.service.cancel(id);
    release();
    await sending;
    await settle();

    expect(h.service.list().find((x) => x.id === id)!.status).toBe('cancelled');
    expect(script.connects()).toBe(0);
  });

  it('starts one session however many times Resume is clicked', async () => {
    const script = scriptedConnect(() => {}); // a peer that never answers
    const h = createHarness({ connect: script.connect, items: oneFile });
    await withSource(h);
    const id = await h.service.send('dev-1', ['/src/a.bin']);
    await settle();
    await h.service.pause(id);
    await Promise.all([h.service.resume(id), h.service.resume(id), h.service.resume(id)]);
    await settle();
    expect(script.connects()).toBe(2); // the original send, plus one resume
  });

  it('does not revive a cancelled send when the receiver asks to resume it', async () => {
    const script = scriptedConnect(() => {});
    const h = createHarness({ connect: script.connect, items: oneFile });
    await h.service.start();
    await withSource(h);
    const id = await h.service.send('dev-1', ['/src/a.bin']);
    await settle();
    await h.service.cancel(id);
    const before = script.connects();

    const peer = h.acceptConnection(createSocketPair(), 'peer-fingerprint-abc');
    peer.write(helloFrame('peer'));
    peer.write(encodeControlFrame(FrameType.RESUME_REQUEST, { transferId: id }));
    await settle();

    expect(script.connects()).toBe(before);
    expect(h.service.list().find((x) => x.id === id)!.status).toBe('cancelled');
  });

  it('closes the offer prompt when the sender goes away before an answer', async () => {
    const h = createHarness();
    await h.service.start();
    const closed: string[] = [];
    let offerId = '';
    h.service.events.on('offerIncoming', (o) => (offerId = o.offerId));
    h.service.events.on('offerClosed', ({ offerId: id }) => closed.push(id));

    const peer = h.acceptConnection(createSocketPair(), 'peer-fingerprint-abc');
    peer.write(helloFrame('peer'));
    peer.write(
      encodeControlFrame(FrameType.OFFER, {
        transferId: 'tx-gone',
        items: oneFile,
        totalBytes: 9,
        fileCount: 1,
      }),
    );
    await settle();
    expect(offerId).not.toBe('');

    peer.destroy();
    await settle();

    expect(closed).toEqual([offerId]);
    expect(h.service.list().find((x) => x.id === 'tx-gone')).toBeUndefined();
  });
});
