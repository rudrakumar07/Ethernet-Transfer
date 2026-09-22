import { EventEmitter } from 'node:events';

export interface FakeSocketOptions {
  /** Bytes allowed in the write buffer before write() starts returning false. */
  highWaterMark?: number;
  /**
   * When true, written chunks sit in the write buffer until flushWrites() is
   * called, modelling a NIC that drains more slowly than the disk fills it.
   */
  manualFlush?: boolean;
}

/**
 * A minimal fake duplex socket implementing just what frame-stream.ts and the
 * sender/receiver sessions use: write/end/destroy plus 'data'/'end'/'close'
 * events, and enough of Node's backpressure contract (write() returning false,
 * a 'drain' event, writableLength) to test that senders actually honour it.
 */
export class FakeSocket extends EventEmitter {
  private peerRef: FakeSocket | null = null;
  private ended = false;
  private readonly highWaterMark: number;
  private readonly manualFlush: boolean;
  private outbox: Buffer[] = [];
  private needsDrain = false;
  private paused = false;
  private readQueue: Buffer[] = [];

  /** Bytes written but not yet flushed. Mirrors net.Socket#writableLength. */
  writableLength = 0;
  /** High-water mark actually reached during this socket's lifetime. */
  peakWritableLength = 0;

  /** Set once the peer closes: writes after that fail, like a real socket's. */
  private peerClosed = false;

  constructor(options: FakeSocketOptions = {}) {
    super();
    this.on('close', () => {
      this.peerClosed = true;
    });
    this.highWaterMark = options.highWaterMark ?? Number.POSITIVE_INFINITY;
    this.manualFlush = options.manualFlush ?? false;
  }

  setPeer(peer: FakeSocket) {
    this.peerRef = peer;
  }

  get destroyed(): boolean {
    return this.ended || this.peerClosed;
  }

  get writableEnded(): boolean {
    return this.ended;
  }

  write(chunk: Buffer): boolean {
    if (this.destroyed) return false;
    this.writableLength += chunk.length;
    if (this.writableLength > this.peakWritableLength) this.peakWritableLength = this.writableLength;

    if (this.manualFlush) {
      this.outbox.push(Buffer.from(chunk));
    } else {
      // Deliver asynchronously so this behaves like a real socket, not a
      // same-tick reentrant call.
      this.writableLength = 0;
      queueMicrotask(() => this.peerRef?.deliver(chunk));
    }

    if (this.writableLength >= this.highWaterMark) {
      this.needsDrain = true;
      return false;
    }
    return true;
  }

  /** Delivers everything queued by write() and releases any waiting writer. */
  flushWrites(): void {
    const pending = this.outbox;
    this.outbox = [];
    this.writableLength = 0;
    for (const chunk of pending) this.peerRef?.deliver(chunk);
    if (this.needsDrain) {
      this.needsDrain = false;
      this.emit('drain');
    }
  }

  /** Receives a chunk from the peer, honouring pause()/resume(). */
  deliver(chunk: Buffer): void {
    if (this.paused) this.readQueue.push(chunk);
    else this.emit('data', chunk);
  }

  pause(): this {
    this.paused = true;
    return this;
  }

  resume(): this {
    this.paused = false;
    const queued = this.readQueue;
    this.readQueue = [];
    for (const chunk of queued) this.emit('data', chunk);
    return this;
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.flushWrites();
    queueMicrotask(() => {
      this.peerRef?.emit('end');
      this.peerRef?.emit('close');
    });
  }

  destroy(): void {
    if (this.ended) return;
    this.ended = true;
    queueMicrotask(() => {
      this.peerRef?.emit('close');
    });
  }
}

/**
 * Wires two fake sockets together in-process so the real protocol code can run
 * without any network I/O. Options apply to the first socket only - the peer
 * stays on immediate delivery so scripted replies need no flushing.
 */
export function createSocketPair(options: FakeSocketOptions = {}): [FakeSocket, FakeSocket] {
  const a = new FakeSocket(options);
  const b = new FakeSocket();
  a.setPeer(b);
  b.setPeer(a);
  return [a, b];
}
