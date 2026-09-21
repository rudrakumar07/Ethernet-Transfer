import { describe, it, expect } from 'vitest';
import { createHarness } from '../fakes/service-harness';
import { createSocketPair } from '../fakes/socket-pair';
import { helloFrame } from '../fakes/hello';
import { FrameType, encodeControlFrame } from '../../src/shared/protocol';
import type { TransferItem, TransferSnapshot } from '../../src/shared/types';

const PEER_FP = 'peer-fingerprint-abc';
const settle = () => new Promise((r) => setTimeout(r, 30));

describe('sending a folder', () => {
  it('reports a scanning status before the transfer is queued', async () => {
    const items: TransferItem[] = [
      { index: 0, relPath: 'album', kind: 'dir', size: 0, mtimeMs: 1 },
      { index: 1, relPath: 'album/a.txt', kind: 'file', size: 3, mtimeMs: 1 },
    ];
    const h = createHarness({ items, connect: async () => { throw new Error('offline'); } });
    const seen: TransferSnapshot[] = [];
    h.service.events.on('updated', (t) => seen.push({ ...t }));

    await h.service.send('dev-1', ['/src/album']);
    await settle();

    // The walk happens before anything can be offered, so a big folder must not
    // look like nothing is happening.
    expect(seen[0].status).toBe('scanning');
    expect(seen.some((s) => s.status === 'queued' || s.status === 'active')).toBe(true);
  });

  it('completes a folder that contains no files at all', async () => {
    const h = createHarness({ isTrusted: () => true });
    await h.service.start();

    const peer = h.acceptConnection(createSocketPair(), PEER_FP);
    peer.write(helloFrame('peer'));
    peer.write(
      encodeControlFrame(FrameType.OFFER, {
        transferId: 'tx-empty',
        items: [
          { index: 0, relPath: 'album', kind: 'dir', size: 0, mtimeMs: 1 },
          { index: 1, relPath: 'album/empty', kind: 'dir', size: 0, mtimeMs: 1 },
        ],
        totalBytes: 0,
        fileCount: 0,
      }),
    );
    await settle();
    peer.write(encodeControlFrame(FrameType.DONE, {}));
    await settle();

    // Folders still have to arrive; a file-less transfer is done once they do,
    // not stuck at "active" forever.
    expect(h.service.list().find((t) => t.id === 'tx-empty')?.status).toBe('completed');
  });

  it('fails with a clear reason when the folder has too many files', async () => {
    const h = createHarness({
      buildFileList: async () => {
        throw new Error('too-many-files');
      },
    });

    await expect(h.service.send('dev-1', ['/src/huge'])).rejects.toThrow('too-many-files');
    // and it does not leave a half-built transfer behind
    expect(h.service.list().filter((t) => t.status !== 'failed')).toHaveLength(0);
  });
});
