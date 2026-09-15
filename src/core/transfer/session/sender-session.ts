import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { CHUNK_SIZE, FrameType, encodeControlFrame, encodeDataFrame } from '../../../shared/protocol';
import { frameStream } from '../protocol/frame-stream';
import { decodeControlPayload } from '../protocol/codec';
import type { FileSystem, Logger } from '../../ports';
import type { TransferItem } from '../../../shared/types';

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
}

/** Drives one outgoing TLS connection through OFFER, FILE frames and DONE (spec §5.3, §5.6-§5.7). */
export async function runSenderSession(socket: Duplex, deps: SenderSessionDeps): Promise<void> {
  const { fs, logger, transferId, items, sourceOf, onProgress, onFileDone, onDeclined, resume } = deps;

  function send(type: (typeof FrameType)[keyof typeof FrameType], payload: unknown) {
    socket.write(encodeControlFrame(type, payload));
  }

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

  const first = await nextFrame();
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
      for await (const chunk of fs.openRead(source.absolutePath, { start: offset })) {
        hash.update(chunk);
        socket.write(encodeDataFrame(chunk));
        sent += chunk.byteLength;
        onProgress(item.index, chunk.byteLength);
        void CHUNK_SIZE; // chunk size is enforced by the FileSystem adapter's stream options
      }

      send(FrameType.FILE_END, { index: item.index, sha256: hash.digest('hex') });
      const reply = await nextFrame();
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
    if (!done) {
      send(FrameType.FILE_FAILED, { index: item.index, reason: 'hash-mismatch' });
      onFileDone(item.index, false, 'hash-mismatch');
    }
  }

  send(FrameType.DONE, {});
  socket.end();
}
