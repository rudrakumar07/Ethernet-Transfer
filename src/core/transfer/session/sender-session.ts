import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';
import {
  CHUNK_SIZE,
  FrameType,
  PROTOCOL_VERSION,
  encodeControlFrame,
  encodeDataFrame,
  type Hello,
} from '../../../shared/protocol';
import { frameStream } from '../protocol/frame-stream';
import { decodeControlPayload } from '../protocol/codec';
import { writeWithBackpressure } from '../protocol/flow-control';
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
  /** A file is (re)starting at this absolute byte offset (see receiver-session). */
  onFileOffset?: (index: number, absoluteOffset: number) => void;
  onFileDone: (index: number, ok: boolean, reason?: string) => void;
  onDeclined?: (reason: string) => void;
  resume?: boolean;
  /** When set, a Pause/Cancel request stops sending immediately (spec: user-initiated pause/cancel). */
  control?: SessionControl;
  /** File indices already verified in a prior attempt - skipped entirely on a resume/retry. */
  alreadyVerified?: Set<number>;
  /** This device's identity for the HELLO handshake (spec §5.2). */
  hello: Omit<Hello, 'protocolVersion'>;
  /** Called if the peer's protocolVersion major differs from ours (spec §5.2/§9's version check). */
  onIncompatibleVersion?: (peerAppVersion: string) => void;
}

/** Drives one outgoing TLS connection through OFFER, FILE frames and DONE (spec §5.3, §5.6-§5.7). */
export async function runSenderSession(socket: Duplex, deps: SenderSessionDeps): Promise<void> {
  const {
    fs,
    logger,
    transferId,
    items,
    sourceOf,
    onProgress,
    onFileOffset,
    onFileDone,
    onDeclined,
    resume,
    control,
    alreadyVerified,
    hello,
    onIncompatibleVersion,
  } = deps;

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

  const stream = frameStream(socket)[Symbol.asyncIterator]();

  async function nextFrame() {
    const { value, done } = await stream.next();
    if (done) throw new Error('connection-closed');
    return value;
  }

  // HELLO handshake (spec §5.2-§5.3): both sides identify themselves and
  // check protocol compatibility before anything else crosses the wire.
  send(FrameType.HELLO, { ...hello, protocolVersion: PROTOCOL_VERSION });
  let helloReply;
  try {
    helloReply = await nextFrame();
  } catch {
    return; // aborted, or the peer vanished before replying at all
  }
  if (helloReply.type === FrameType.ERROR) {
    const err = decodeControlPayload<{ code: string; message: string }>(helloReply.type, helloReply.payload);
    if (err.code === 'incompatible-version') onIncompatibleVersion?.(err.message);
    socket.end();
    return;
  }
  if (helloReply.type !== FrameType.HELLO) {
    socket.destroy();
    return;
  }
  const peerHello = decodeControlPayload<Hello>(helloReply.type, helloReply.payload);
  if (Math.trunc(peerHello.protocolVersion) !== Math.trunc(PROTOCOL_VERSION)) {
    send(FrameType.ERROR, { code: 'incompatible-version', message: peerHello.appVersion });
    onIncompatibleVersion?.(peerHello.appVersion);
    socket.end();
    return;
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

      onFileOffset?.(item.index, offset);
      const hash = createHash('sha256');
      if (offset > 0) {
        for await (const chunk of fs.openRead(source.absolutePath, { start: 0 })) {
          hash.update(chunk.subarray(0, Math.min(chunk.length, offset)));
          if (chunk.length >= offset) break;
        }
      }

      let aborted = false;
      for await (const chunk of fs.openRead(source.absolutePath, { start: offset })) {
        if (control?.isAborted()) {
          aborted = true;
          break;
        }
        // Frames are split to stay inside the protocol's payload ceiling; the
        // filesystem adapter's chunk size is a hint, not a guarantee.
        for (let start = 0; start < chunk.byteLength; start += CHUNK_SIZE) {
          const slice = chunk.subarray(start, Math.min(start + CHUNK_SIZE, chunk.byteLength));
          hash.update(slice);
          // Waiting for drain is what keeps the socket's write buffer bounded
          // and makes reported progress track bytes that actually left.
          await writeWithBackpressure(socket, encodeDataFrame(slice));
          if (control?.isAborted()) {
            aborted = true;
            break;
          }
          onProgress(item.index, slice.byteLength);
        }
        if (aborted) break;
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
