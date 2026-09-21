import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFileList, MAX_ITEMS_PER_TRANSFER } from '../../src/core/transfer/build-file-list';

let root: string;

beforeAll(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'etherlist-'));
  await fsp.mkdir(path.join(root, 'album', 'nested', 'deeper'), { recursive: true });
  await fsp.mkdir(path.join(root, 'album', 'empty'), { recursive: true });
  await fsp.writeFile(path.join(root, 'album', 'top.txt'), 'top');
  await fsp.writeFile(path.join(root, 'album', 'nested', 'mid.txt'), 'mid');
  await fsp.writeFile(path.join(root, 'album', 'nested', 'deeper', 'low.txt'), 'low');
  await fsp.writeFile(path.join(root, 'loose.txt'), 'loose');
});

afterAll(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

describe('buildFileList over a folder', () => {
  it('walks nested folders, keeping directories and files', async () => {
    const items = await buildFileList([path.join(root, 'album')]);
    const files = items.filter((i) => i.kind === 'file').map((i) => i.relPath).sort();
    const dirs = items.filter((i) => i.kind === 'dir').map((i) => i.relPath).sort();

    expect(files).toEqual(['album/nested/deeper/low.txt', 'album/nested/mid.txt', 'album/top.txt']);
    // Empty directories are carried so the tree is recreated faithfully.
    expect(dirs).toContain('album/empty');
    expect(dirs).toContain('album/nested');
  });

  it('uses forward slashes on every platform', async () => {
    const items = await buildFileList([path.join(root, 'album')]);
    const backslash = String.fromCharCode(92);
    expect(items.every((i) => !i.relPath.includes(backslash))).toBe(true);
  });

  it('maps every file item to its source path', async () => {
    const items = await buildFileList([path.join(root, 'album')]);
    for (const item of items.filter((i) => i.kind === 'file')) {
      expect(items.sources.get(item.index)).toBeTruthy();
    }
  });

  it('accepts a mix of loose files and folders in one transfer', async () => {
    const items = await buildFileList([path.join(root, 'loose.txt'), path.join(root, 'album')]);
    const files = items.filter((i) => i.kind === 'file').map((i) => i.relPath);
    expect(files).toContain('loose.txt');
    expect(files).toContain('album/top.txt');
  });

  it('reports scan progress as it walks', async () => {
    const seen: number[] = [];
    await buildFileList([path.join(root, 'album')], { onProgress: (n) => seen.push(n) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBeGreaterThanOrEqual(3);
  });

  it('skips symlinks instead of following them into a loop', async () => {
    const linkDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'etherlink-'));
    await fsp.writeFile(path.join(linkDir, 'real.txt'), 'real');
    try {
      fs.symlinkSync(linkDir, path.join(linkDir, 'loop'), 'dir');
    } catch {
      return; // symlink creation needs privileges on some Windows setups
    }
    try {
      const items = await buildFileList([linkDir]);
      expect(items.some((i) => i.relPath.includes('loop'))).toBe(false);
      expect(items.filter((i) => i.kind === 'file')).toHaveLength(1);
    } finally {
      await fsp.rm(linkDir, { recursive: true, force: true });
    }
  }, 20_000);

  it('exposes a file-count ceiling so a huge folder fails clearly', () => {
    expect(MAX_ITEMS_PER_TRANSFER).toBeGreaterThan(100_000);
  });
});
