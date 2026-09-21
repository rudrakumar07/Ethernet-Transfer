import path from 'node:path';
import type { FileSystem, ReadableByteStream, WritableByteStream } from '../../src/core/ports';

interface FileEntry {
  data: Buffer;
  mtimeMs: number;
}

export interface FakeFileSystemOptions {
  /**
   * Split reads into chunks of this size, the way fs.createReadStream does
   * (64 KiB by default in Node). Left unset, a read yields the whole file as a
   * single chunk, which is what most tests want.
   */
  readChunkSize?: number;
}

/** In-memory FileSystem port implementation for unit/integration tests. */
export function createFakeFileSystem(
  options: FakeFileSystemOptions = {},
): FileSystem & { _dump(): Record<string, string> } {
  const files = new Map<string, FileEntry>();
  const dirs = new Set<string>();

  function normalize(p: string): string {
    return path.normalize(p).replace(/\\/g, '/');
  }

  return {
    async stat(p) {
      const key = normalize(p);
      const file = files.get(key);
      if (file) return { size: file.data.length, mtimeMs: file.mtimeMs, isDirectory: false };
      if (dirs.has(key)) return { size: 0, mtimeMs: 0, isDirectory: true };
      return null;
    },

    async freeSpace() {
      return { freeBytes: 100 * 1024 * 1024 * 1024 };
    },

    async mkdirRecursive(p) {
      dirs.add(normalize(p));
    },

    async rename(from, to) {
      const key = normalize(from);
      const entry = files.get(key);
      if (entry) {
        files.delete(key);
        files.set(normalize(to), entry);
      }
    },

    async rm(p) {
      files.delete(normalize(p));
    },

    async truncate(p, size) {
      const key = normalize(p);
      const entry = files.get(key) ?? { data: Buffer.alloc(0), mtimeMs: Date.now() };
      entry.data = entry.data.subarray(0, size);
      files.set(key, entry);
    },

    async utimes(p, mtimeMs) {
      const key = normalize(p);
      const entry = files.get(key);
      if (entry) entry.mtimeMs = mtimeMs;
    },

    async exists(p) {
      const key = normalize(p);
      return files.has(key) || dirs.has(key);
    },

    async openWrite(p, opts) {
      const key = normalize(p);
      if (!opts.append || !files.has(key)) {
        files.set(key, { data: Buffer.alloc(0), mtimeMs: Date.now() });
      }
      const stream: WritableByteStream = {
        async write(chunk) {
          const entry = files.get(key)!;
          entry.data = Buffer.concat([entry.data, chunk]);
        },
        async close() {
          /* no-op for the in-memory fake */
        },
      };
      return stream;
    },

    openRead(p, opts) {
      const key = normalize(p);
      const entry = files.get(key);
      const start = opts?.start ?? 0;
      const data = entry ? entry.data.subarray(start) : Buffer.alloc(0);
      const chunkSize = options.readChunkSize ?? Number.POSITIVE_INFINITY;
      const readable: ReadableByteStream = {
        [Symbol.asyncIterator]() {
          let offset = 0;
          return {
            async next() {
              if (offset >= data.length) return { value: undefined as never, done: true };
              const end = Math.min(offset + chunkSize, data.length);
              const chunk = data.subarray(offset, end);
              offset = end;
              return { value: chunk, done: false };
            },
          };
        },
      };
      return readable;
    },

    async readJson<T>(p: string) {
      const key = normalize(p);
      const entry = files.get(key);
      if (!entry) return null;
      try {
        return JSON.parse(entry.data.toString('utf8')) as T;
      } catch {
        return null;
      }
    },

    async writeJsonAtomic(p, data) {
      files.set(normalize(p), { data: Buffer.from(JSON.stringify(data)), mtimeMs: Date.now() });
    },

    async appendJsonLine(p, data) {
      const key = normalize(p);
      const entry = files.get(key) ?? { data: Buffer.alloc(0), mtimeMs: Date.now() };
      entry.data = Buffer.concat([entry.data, Buffer.from(JSON.stringify(data) + '\n')]);
      files.set(key, entry);
    },

    async readJsonLines<T>(p: string) {
      const key = normalize(p);
      const entry = files.get(key);
      if (!entry) return [];
      return entry.data
        .toString('utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as T);
    },

    _dump() {
      const out: Record<string, string> = {};
      for (const [k, v] of files) out[k] = v.data.toString('utf8');
      return out;
    },
  };
}
