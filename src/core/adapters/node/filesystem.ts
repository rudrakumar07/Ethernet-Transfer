import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { FileSystem, ReadableByteStream, WritableByteStream } from '../../ports';

async function ensureParentDir(filePath: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

export function createNodeFileSystem(): FileSystem {
  return {
    async stat(p) {
      try {
        const s = await fsp.stat(p);
        return { size: s.size, mtimeMs: s.mtimeMs, isDirectory: s.isDirectory() };
      } catch {
        return null;
      }
    },

    async freeSpace(p) {
      const s = await fsp.statfs(p);
      return { freeBytes: s.bsize * s.bavail };
    },

    async mkdirRecursive(p) {
      await fsp.mkdir(p, { recursive: true });
    },

    async rename(from, to) {
      await ensureParentDir(to);
      await fsp.rename(from, to);
    },

    async rm(p) {
      await fsp.rm(p, { force: true, recursive: true });
    },

    async truncate(p, size) {
      await fsp.truncate(p, size);
    },

    async utimes(p, mtimeMs) {
      const d = new Date(mtimeMs);
      await fsp.utimes(p, d, d);
    },

    async exists(p) {
      try {
        await fsp.access(p);
        return true;
      } catch {
        return false;
      }
    },

    async openWrite(p, opts) {
      await ensureParentDir(p);
      const handle = await fsp.open(p, opts.append ? 'a' : 'w');
      const stream: WritableByteStream = {
        async write(chunk) {
          await handle.write(chunk);
        },
        async close() {
          await handle.close();
        },
      };
      return stream;
    },

    openRead(p, opts) {
      const nodeStream = fs.createReadStream(p, { start: opts?.start });
      const readable: ReadableByteStream = {
        [Symbol.asyncIterator]() {
          const iterator = nodeStream[Symbol.asyncIterator]();
          return {
            async next() {
              const { value, done } = await iterator.next();
              return { value: value as Buffer, done };
            },
          };
        },
      };
      return readable;
    },

    async readJson<T>(p: string) {
      try {
        const raw = await fsp.readFile(p, 'utf8');
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },

    async writeJsonAtomic(p, data) {
      await ensureParentDir(p);
      const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
      await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await fsp.rename(tmp, p);
    },

    async appendJsonLine(p, data) {
      await ensureParentDir(p);
      await fsp.appendFile(p, JSON.stringify(data) + '\n', 'utf8');
    },

    async readJsonLines<T>(p: string) {
      try {
        const raw = await fsp.readFile(p, 'utf8');
        return raw
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as T);
      } catch {
        return [];
      }
    },
  };
}
