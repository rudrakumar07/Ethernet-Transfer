import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { CHUNK_SIZE, FrameType, encodeControlFrame, encodeDataFrame } from '../../../shared/protocol';
import { frameStream } from '../protocol/frame-stream';
import { decodeControlPayload } from '../protocol/codec';
import type { FileSystem, Logger } from '../../ports';
import type { TransferItem } from '../../../shared/types';
import type { SessionControl } from './control';

export interface SourceFile {
  item: TransferItem;
  absolutePath: string;
}

export interface SenderSessionDeps {
  fs: FileSystem;
  logger: Logger;
  transferId: string;
  items: TransferItem[];
  sourceOf: (index: number) => SourceFile | undefined;
  onProgress: (index: number, bytesDone: number) => void;
  onFileDone: (index: number, ok: boolean, reason?: string) => void;
  onDeclined?: (reason: string) => void;
  resume?: boolean;
  /** When set, a Pause/Cancel request stops sending immediately (spec: user-initiated pause/cancel). */
  control?: SessionControl;
  /** File indices already verified in a prior attempt - skipped entirely on a resume/retry. */
  alreadyVerified?: Set<number>;
}

/** Drives one outgoing TLS connection through OFFER, FILE frames and DONE (spec §5.3, §5.6-§5.7). */
export async function runSenderSession(socket: Duplex, deps: SenderSessionDeps): Promise<void> {
  const { fs, logger, transferId, items, sourceOf, onProgress, onFileDone, onDeclined, resume, control, alreadyVerified } =
    deps;

  function send(type: (typeof FrameType)[keyof typeof FrameType], payload: unknown) {
    socket.write(encodeControlFrame(type, payload));
  }

  // React to a local Pause/Cancel request the instant it happens, rather than
  // only at the next natural checkpoint - it tells the peer, then stops the
  // connection outright so no further bytes can be written.
  control?.onAbort((reason) => {
    try {
      send(reason === 'pause' ? FrameType.PAUSE : FrameType.CANCEL, {});
    } catch {
      // socket may already be closing; nothing more to do
    }
    socket.end();
  });

  const totalBytes = items.reduce((sum, i) => sum + i.size, 0);
  if (resume) {
    send(FrameType.RESUME, { transferId });
  } else {
    send(FrameType.OFFER, {
      transferId,
      items,
      totalBytes,
      fileCount: items.filter((i) => i.kind === 'file').length,
    });
  }

  const stream = frameStream(socket)[Symbol.asyncIterator]();

  async function nextFrame() {
    const { value, done } = await stream.next();
    if (done) throw new Error('connection-closed');
    return value;
  }

  let first;
  try {
    first = await nextFrame();
  } catch {
    return; // aborted (or peer vanished) before it ever replied to the offer
  }
  let offsets: Record<string, number> = {};
  if (first.type === FrameType.ACCEPT) {
    offsets = decodeControlPayload<{ offsets: Record<string, number> }>(first.type, first.payload).offsets;
  } else if (first.type === FrameType.DECLINE) {
    const declined = decodeControlPayload<{ reason: string }>(first.type, first.payload);
    onDeclined?.(declined.reason);
    socket.end();
    return;
  } else {
    socket.destroy();
    return;
  }

  for (const item of items.filter((i) => i.kind === 'file')) {
    if (control?.isAborted()) break;
    if (alreadyVerified?.has(item.index)) continue;
    const source = sourceOf(item.index);
    if (!source) {
      send(FrameType.FILE_FAILED, { index: item.index, reason: 'source-missing' });
      onFileDone(item.index, false, 'source-missing');
      continue;
    }

    const stat = await fs.stat(source.absolutePath);
    if (!stat) {
      send(FrameType.FILE_FAILED, { index: item.index, reason: 'source-missing' });
      onFileDone(item.index, false, 'source-missing');
      continue;
    }

    let offset = offsets[String(item.index)] ?? 0;
    const changed = stat.size !== item.size || stat.mtimeMs !== item.mtimeMs;
    if (changed) offset = 0;

    let attemptsLeft = 2;
    let done = false;
    while (attemptsLeft > 0 && !done) {
      attemptsLeft -= 1;
      send(FrameType.FILE_START, {
        index: item.index,
        offset,
        size: changed ? stat.size : undefined,
        mtimeMs: changed ? stat.mtimeMs : undefined,
      });

      const hash = createHash('sha256');
      if (offset > 0) {
        for await (const chunk of fs.openRead(source.absolutePath, { start: 0 })) {
          hash.update(chunk.subarray(0, Math.min(chunk.length, offset)));
          if (chunk.length >= offset) break;
        }
      }

      let sent = offset;
      let aborted = false;
      for await (const chunk of fs.openRead(source.absolutePath, { start: offset })) {
        if (control?.isAborted()) {
          aborted = true;
          break;
        }
        hash.update(chunk);
        socket.write(encodeDataFrame(chunk));
        sent += chunk.byteLength;
        onProgress(item.index, chunk.byteLength);
        void CHUNK_SIZE; // chunk size is enforced by the FileSystem adapter's stream options
      }
      if (aborted) break;

      send(FrameType.FILE_END, { index: item.index, sha256: hash.digest('hex') });
      let reply;
      try {
        reply = await nextFrame();
      } catch {
        // Connection ended - either the peer went away, or our own abort
        // handler closed it. Either way there is nothing further to send.
        break;
      }
      if (reply.type === FrameType.FILE_OK) {
        done = true;
        onFileDone(item.index, true);
      } else if (reply.type === FrameType.FILE_RETRY) {
        offset = 0;
        logger.warn('hash mismatch, retrying from zero', { index: item.index });
      } else {
        break;
      }
    }
    if (!done && !control?.isAborted()) {
      send(FrameType.FILE_FAILED, { index: item.index, reason: 'hash-mismatch' });
      onFileDone(item.index, false, 'hash-mismatch');
    }
  }

  if (!control?.isAborted()) {
    send(FrameType.DONE, {});
    socket.end();
  }
}
