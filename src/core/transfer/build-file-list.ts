import fsp from 'node:fs/promises';
import path from 'node:path';
import type { TransferItem } from '../../shared/types';

/**
 * Ceiling on items in one transfer.
 *
 * The whole manifest ships in a single OFFER frame (MAX_MANIFEST_PAYLOAD),
 * and each item costs roughly 110 bytes of JSON. Refusing here, by count,
 * turns "folder too big" into a message a person can act on instead of a raw
 * frame-too-large protocol error mid-handshake.
 */
export const MAX_ITEMS_PER_TRANSFER = 130_000;

/** How often scan progress is reported, in items. */
const PROGRESS_EVERY = 250;

export interface BuildFileListOptions {
  /** Reports files found and bytes seen so far while a large folder is walked. */
  onProgress?: (filesScanned: number, bytesScanned: number) => void;
}

/** Relative paths travel over the wire with forward slashes on every platform. */
function toWirePath(p: string): string {
  return p.split(path.sep).join('/');
}

/** Walk local paths (files and/or folders) into a flat TransferItem list with source paths. */
export async function buildFileList(
  absolutePaths: string[],
  options: BuildFileListOptions = {},
): Promise<TransferItem[] & { sources: Map<number, string> }> {
  const items: TransferItem[] = [];
  const sources = new Map<number, string>();
  let index = 0;
  let filesScanned = 0;
  let bytesScanned = 0;
  let sinceReport = 0;

  function report(force = false) {
    sinceReport += 1;
    if (!force && sinceReport < PROGRESS_EVERY) return;
    sinceReport = 0;
    options.onProgress?.(filesScanned, bytesScanned);
  }

  async function walk(absPath: string, relPrefix: string) {
    if (index >= MAX_ITEMS_PER_TRANSFER) {
      throw new Error('too-many-files');
    }
    // lstat, not stat: a symlink pointing at an ancestor makes a followed walk
    // recurse until it runs out of stack or path length. Links are skipped
    // rather than followed, so the tree that is sent is the tree on disk.
    const stat = await fsp.lstat(absPath);
    if (stat.isSymbolicLink()) return;

    if (stat.isDirectory()) {
      const relPath = relPrefix || path.basename(absPath);
      items.push({ index: index++, relPath: toWirePath(relPath), kind: 'dir', size: 0, mtimeMs: stat.mtimeMs });
      const entries = await fsp.readdir(absPath);
      if (entries.length === 0) return;
      for (const entry of entries) {
        await walk(path.join(absPath, entry), path.join(relPath, entry));
      }
      return;
    }

    if (!stat.isFile()) return; // sockets, FIFOs, devices: nothing to send

    const relPath = relPrefix || path.basename(absPath);
    const idx = index++;
    items.push({ index: idx, relPath: toWirePath(relPath), kind: 'file', size: stat.size, mtimeMs: stat.mtimeMs });
    sources.set(idx, absPath);
    filesScanned += 1;
    bytesScanned += stat.size;
    report();
  }

  for (const p of absolutePaths) {
    await walk(p, '');
  }
  report(true);

  return Object.assign(items, { sources });
}
