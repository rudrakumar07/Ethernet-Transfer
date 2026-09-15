export interface WritableByteStream {
  write(chunk: Buffer): Promise<void>;
  close(): Promise<void>;
}

export interface ReadableByteStream {
  [Symbol.asyncIterator](): AsyncIterator<Buffer>;
}

export interface StatResult {
  size: number;
  mtimeMs: number;
  isDirectory: boolean;
}

export interface FreeSpace {
  freeBytes: number;
}

/** All disk access core code needs. Real impl wraps node:fs; fakes use an in-memory tree. */
export interface FileSystem {
  stat(path: string): Promise<StatResult | null>;
  freeSpace(path: string): Promise<FreeSpace>;
  mkdirRecursive(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string): Promise<void>;
  truncate(path: string, size: number): Promise<void>;
  utimes(path: string, mtimeMs: number): Promise<void>;
  exists(path: string): Promise<boolean>;
  openWrite(path: string, opts: { append?: boolean }): Promise<WritableByteStream>;
  openRead(path: string, opts?: { start?: number }): ReadableByteStream;
  readJson<T>(path: string): Promise<T | null>;
  writeJsonAtomic(path: string, data: unknown): Promise<void>;
  appendJsonLine(path: string, data: unknown): Promise<void>;
  readJsonLines<T>(path: string): Promise<T[]>;
}
