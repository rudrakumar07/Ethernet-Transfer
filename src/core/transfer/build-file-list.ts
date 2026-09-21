import fsp from 'node:fs/promises';
import path from 'node:path';
import type { TransferItem } from '../../shared/types';

/** Relative paths travel over the wire with forward slashes on every platform. */
function toWirePath(p: string): string {
  return p.split(path.sep).join('/');
}

/** Walk local paths (files and/or folders) into a flat TransferItem list with source paths. */
export async function buildFileList(
  absolutePaths: string[],
): Promise<TransferItem[] & { sources: Map<number, string> }> {
  const items: TransferItem[] = [];
  const sources = new Map<number, string>();
  let index = 0;

  async function walk(absPath: string, relPrefix: string) {
    const stat = await fsp.stat(absPath);
    if (stat.isDirectory()) {
      const relPath = relPrefix || path.basename(absPath);
      items.push({ index: index++, relPath: toWirePath(relPath), kind: 'dir', size: 0, mtimeMs: stat.mtimeMs });
      const entries = await fsp.readdir(absPath);
      if (entries.length === 0) return;
      for (const entry of entries) {
        await walk(path.join(absPath, entry), path.join(relPath, entry));
      }
    } else {
      const relPath = relPrefix || path.basename(absPath);
      const idx = index++;
      items.push({ index: idx, relPath: toWirePath(relPath), kind: 'file', size: stat.size, mtimeMs: stat.mtimeMs });
      sources.set(idx, absPath);
    }
  }

  for (const p of absolutePaths) {
    await walk(p, '');
  }

  return Object.assign(items, { sources });
}
