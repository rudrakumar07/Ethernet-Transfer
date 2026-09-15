import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { FrameType } from '../../../shared/protocol';
import { encodeControlFrame } from '../../../shared/protocol';
import { frameStream } from '../protocol/frame-stream';
import { decodeControlPayload } from '../protocol/codec';
import { isValidRelPath, resolveWithinRoot } from '../logic/path-validator';
import type { FileSystem, Logger } from '../../ports';
import type { TransferItem } from '../../../shared/types';

export interface ReceiverSessionDeps {
  fs: FileSystem;
  logger: Logger;
  destinationRoot: string;
  onProgress: (index: number, bytesDone: number) => void;
  onFileDone: (index: number, ok: boolean, reason?: string) => void;
  onOffer: (offer: { transferId: string; items: TransferItem[]; totalBytes: number; fileCount: number }) => Promise<{
    accept: boolean;
    offsets?: Record<number, number>;
  }>;
}

const PART_SUFFIX = '.etpart';

/** Async variant of the "name (1).ext" conflict resolver (spec §5.5), using real fs.exists. */
async function resolveConflictFree(fs: FileSystem, desiredPath: string): Promise<string> {
  if (!(await fs.exists(desiredPath))) return desiredPath;
  const ext = path.extname(desiredPath);
  const base = path.basename(desiredPath, ext);
  const dir = path.dirname(desiredPath);
  let n = 1;
  for (;;) {
    const candidate = path.join(dir, `${base} (${n})${ext}`);
    if (!(await fs.exists(candidate))) return candidate;
    n += 1;
  }
}

/** Drives one incoming TLS connection through OFFER, FILE frames and DONE (spec §5.3-§5.6). */
export async function runReceiverSession(socket: Duplex, deps: ReceiverSessionDeps): Promise<void> {
  const { fs, logger, destinationRoot, onProgress, onFileDone, onOffer } = deps;
  const finalPaths = new Map<number, string>();
  const mtimes = new Map<number, number>();
  const hashes = new Map<number, ReturnType<typeof createHash>>();
  let writeStream: Awaited<ReturnType<FileSystem['openWrite']>> | null = null;
  let currentIndex = -1;

  function send(type: (typeof FrameType)[keyof typeof FrameType], payload: unknown) {
    socket.write(encodeControlFrame(type, payload));
  }

  try {
    for await (const frame of frameStream(socket)) {
      switch (frame.type) {
        case FrameType.OFFER: {
          const offer = decodeControlPayload<{
            transferId: string;
            items: TransferItem[];
            totalBytes: number;
            fileCount: number;
          }>(frame.type, frame.payload);

          for (const item of offer.items) {
            if (!isValidRelPath(item.relPath)) {
              send(FrameType.ERROR, { code: 'invalid-path', message: `Invalid path: ${item.relPath}` });
              socket.destroy();
              return;
            }
          }

          const result = await onOffer(offer);
          if (!result.accept) {
            send(FrameType.DECLINE, { reason: 'user' });
            socket.end();
            return;
          }

          // Create directories up front.
          for (const item of offer.items.filter((i) => i.kind === 'dir')) {
            const dest = resolveWithinRoot(destinationRoot, item.relPath, path.resolve, path.sep);
            if (dest) await fs.mkdirRecursive(dest);
          }
          for (const item of offer.items.filter((i) => i.kind === 'file')) {
            const dest = resolveWithinRoot(destinationRoot, item.relPath, path.resolve, path.sep);
            if (dest) {
              finalPaths.set(item.index, dest);
              mtimes.set(item.index, item.mtimeMs);
            }
          }

          send(FrameType.ACCEPT, { offsets: result.offsets ?? {} });
          break;
        }

        case FrameType.FILE_START: {
          const start = decodeControlPayload<{ index: number; offset: number; size?: number; mtimeMs?: number }>(
            frame.type,
            frame.payload,
          );
          currentIndex = start.index;
          const finalPath = finalPaths.get(start.index);
          if (!finalPath) break;
          const partPath = finalPath + PART_SUFFIX;
          if (start.offset === 0) {
            await fs.rm(partPath);
          } else {
            const stat = await fs.stat(partPath);
            if (stat && stat.size > start.offset) {
              await fs.truncate(partPath, start.offset);
            }
          }
          writeStream = await fs.openWrite(partPath, { append: start.offset > 0 });
          const hash = createHash('sha256');
          if (start.offset > 0) {
            // Rebuild hash state from existing bytes (spec §5.7).
            for await (const chunk of fs.openRead(partPath, { start: 0 })) {
              hash.update(chunk);
            }
          }
          hashes.set(start.index, hash);
          onProgress(start.index, start.offset);
          break;
        }

        case FrameType.DATA: {
          if (writeStream && currentIndex >= 0) {
            await writeStream.write(frame.payload);
            hashes.get(currentIndex)?.update(frame.payload);
            onProgress(currentIndex, frame.payload.byteLength);
          }
          break;
        }

        case FrameType.FILE_END: {
          const end = decodeControlPayload<{ index: number; sha256: string }>(frame.type, frame.payload);
          await writeStream?.close();
          writeStream = null;
          const hash = hashes.get(end.index);
          const computed = hash?.digest('hex');
          if (computed === end.sha256) {
            const finalPath = finalPaths.get(end.index);
            if (finalPath) {
              const partPath = finalPath + PART_SUFFIX;
              const target = await resolveConflictFree(fs, finalPath);
              await fs.rename(partPath, target);
              const mtimeMs = mtimes.get(end.index);
              if (mtimeMs) await fs.utimes(target, mtimeMs);
            }
            send(FrameType.FILE_OK, { index: end.index });
            onFileDone(end.index, true);
          } else {
            const finalPath = finalPaths.get(end.index);
            if (finalPath) await fs.truncate(finalPath + PART_SUFFIX, 0).catch(() => undefined);
            send(FrameType.FILE_RETRY, { index: end.index });
          }
          hashes.delete(end.index);
          currentIndex = -1;
          break;
        }

        case FrameType.FILE_FAILED: {
          const failed = decodeControlPayload<{ index: number; reason: string }>(frame.type, frame.payload);
          onFileDone(failed.index, false, failed.reason);
          break;
        }

        case FrameType.PAUSE:
          socket.end();
          return;

        case FrameType.CANCEL: {
          for (const finalPath of finalPaths.values()) {
            await fs.rm(finalPath + PART_SUFFIX).catch(() => undefined);
          }
          socket.end();
          return;
        }

        case FrameType.DONE:
          socket.end();
          return;

        default:
          break;
      }
    }
  } catch (err) {
    logger.warn('receiver session error', { err: String(err) });
    socket.destroy();
  }
}
