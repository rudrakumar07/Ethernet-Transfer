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
import type { DecodedFrame } from '../protocol/framing';
import { decodeControlPayload } from '../protocol/codec';
import { writeWithBackpressure } from '../protocol/flow-control';
import type { FileSystem, Logger } from '../../ports';
import type { TransferItem } from '../../../shared/types';
import type { SessionControl } from './control';

export interface SourceFile {
  item: TransferItem;
  absolutePath: string;
}

/**
 * How a sender session ended. The service maps each to a transfer status -
 * before this, every exit returned nothing, so a dropped connection or a
 * pause from the receiver left the transfer showing "active" forever.
 */
export type SenderOutcome =
  | 'finished'
  | 'aborted'
  | 'declined'
  | 'incompatible'
  | 'peer-paused'
  | 'peer-cancelled'
  | 'connection-lost';

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

export async function runSenderSession(socket: Duplex, deps: SenderSessionDeps): Promise<SenderOutcome> {
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

  /**
   * One read from the peer, kept outstanding. The receiver speaks mid-file
   * only to say PAUSE or CANCEL (or by hanging up), so holding a read open
   * while streaming lets the sender notice at once - it used to read only
   * after each file, and learned nothing until then.
   */
  interface PendingRead {
    settled: boolean;
    frame: DecodedFrame | null; // null: the connection ended
    promise: Promise<DecodedFrame | null>;
  }
  function read(): PendingRead {
    const r: PendingRead = { settled: false, frame: null, promise: Promise.resolve(null) };
    r.promise = stream.next().then(
      ({ value, done }) => {
        r.settled = true;
        r.frame = done ? null : value;
        return r.frame;
      },
      () => {
        r.settled = true;
        r.frame = null;
        return null;
      },
    );
    return r;
  }

  /**
   * What an unsolicited frame (or silence) from the receiver means for the
   * session. Every such exit also hangs up: the receiver waits for the close
   * to finish its side, and a sender that simply stopped left it waiting.
   */
  function interpret(frame: DecodedFrame | null): SenderOutcome {
    try {
      socket.end();
    } catch {
      // already closed
    }
    if (control?.isAborted()) return 'aborted';
    if (frame?.type === FrameType.PAUSE) return 'peer-paused';
    if (frame?.type === FrameType.CANCEL) return 'peer-cancelled';
    return 'connection-lost';
  }

  // HELLO handshake (spec §5.2-§5.3): both sides identify themselves and
  // check protocol compatibility before anything else crosses the wire.
  send(FrameType.HELLO, { ...hello, protocolVersion: PROTOCOL_VERSION });
  const helloReply = await read().promise;
  if (!helloReply) return interpret(null); // aborted, or the peer vanished first
  if (helloReply.type === FrameType.ERROR) {
    const err = decodeControlPayload<{ code: string; message: string }>(helloReply.type, helloReply.payload);
    if (err.code === 'incompatible-version') onIncompatibleVersion?.(err.message);
    socket.end();
    return 'incompatible';
  }
  if (helloReply.type !== FrameType.HELLO) {
    socket.destroy();
    return 'connection-lost';
  }
  const peerHello = decodeControlPayload<Hello>(helloReply.type, helloReply.payload);
  if (Math.trunc(peerHello.protocolVersion) !== Math.trunc(PROTOCOL_VERSION)) {
    send(FrameType.ERROR, { code: 'incompatible-version', message: peerHello.appVersion });
    onIncompatibleVersion?.(peerHello.appVersion);
    socket.end();
    return 'incompatible';
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

  const first = await read().promise;
  if (!first) return interpret(null);
  let offsets: Record<string, number> = {};
  if (first.type === FrameType.ACCEPT) {
    offsets = decodeControlPayload<{ offsets: Record<string, number> }>(first.type, first.payload).offsets;
  } else if (first.type === FrameType.DECLINE) {
    const declined = decodeControlPayload<{ reason: string }>(first.type, first.payload);
    onDeclined?.(declined.reason);
    socket.end();
    return 'declined';
  } else {
    socket.destroy();
    return interpret(first);
  }

  let pending = read();

  for (const item of items.filter((i) => i.kind === 'file')) {
    if (control?.isAborted()) return 'aborted';
    if (pending.settled) return interpret(pending.frame);
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
        // Rebuild the hash over exactly the bytes the receiver already has.
        // This used to take min(chunk, offset) from every chunk without ever
        // counting down, and stop only when one chunk covered the whole offset
        // - so with real 64 KiB reads it hashed the entire file, the receiver
        // rejected the result, and every resume restarted from zero.
        let remaining = offset;
        for await (const chunk of fs.openRead(source.absolutePath, { start: 0 })) {
          if (control?.isAborted()) return 'aborted';
          if (pending.settled) return interpret(pending.frame);
          const take = Math.min(chunk.length, remaining);
          hash.update(chunk.subarray(0, take));
          remaining -= take;
          if (remaining <= 0) break;
        }
      }

      try {
        for await (const chunk of fs.openRead(source.absolutePath, { start: offset })) {
          // Frames are split to stay inside the protocol's payload ceiling; the
          // filesystem adapter's chunk size is a hint, not a guarantee.
          for (let start = 0; start < chunk.byteLength; start += CHUNK_SIZE) {
            if (control?.isAborted()) return 'aborted';
            if (pending.settled) return interpret(pending.frame);
            const slice = chunk.subarray(start, Math.min(start + CHUNK_SIZE, chunk.byteLength));
            hash.update(slice);
            // Waiting for drain is what keeps the socket's write buffer bounded
            // and makes reported progress track bytes that actually left. The
            // wait races the outstanding read: on a busy link a full buffer
            // can take seconds to drain, and a PAUSE or CANCEL from the
            // receiver must not queue up behind it.
            const written = writeWithBackpressure(socket, encodeDataFrame(slice)).then(() => 'written' as const);
            written.catch(() => undefined); // abandoned below if the peer speaks first
            const winner = await Promise.race([written, pending.promise.then(() => 'peer' as const)]);
            if (winner === 'peer') return interpret(pending.frame);
            onProgress(item.index, slice.byteLength);
          }
        }
      } catch (err) {
        // The socket closed under us. Let the outstanding read say why - a
        // PAUSE or CANCEL may have arrived just before the close.
        if (control?.isAborted()) return 'aborted';
        const why = await pending.promise;
        logger.debug('send interrupted', { err: String(err) });
        return interpret(why);
      }

      send(FrameType.FILE_END, { index: item.index, sha256: hash.digest('hex') });
      const reply = await pending.promise;
      pending = read();
      if (reply?.type === FrameType.FILE_OK) {
        done = true;
        onFileDone(item.index, true);
      } else if (reply?.type === FrameType.FILE_RETRY) {
        offset = 0;
        logger.warn('hash mismatch, retrying from zero', { index: item.index });
      } else {
        // Anything else - PAUSE, CANCEL, or the connection going away - ends
        // the session. It is not a verdict on this file, which the old code
        // recorded as a hash mismatch before carrying on to the next one.
        return interpret(reply);
      }
    }
    if (!done) {
      send(FrameType.FILE_FAILED, { index: item.index, reason: 'hash-mismatch' });
      onFileDone(item.index, false, 'hash-mismatch');
    }
  }

  if (control?.isAborted()) return 'aborted';
  send(FrameType.DONE, {});
  socket.end();
  return 'finished';
}
