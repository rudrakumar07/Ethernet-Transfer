import { EventEmitter } from 'node:events';

/**
 * A minimal fake duplex socket implementing just what frame-stream.ts and the
 * sender/receiver sessions use: write/end/destroy plus 'data'/'end'/'close'
 * events. createSocketPair() wires two of these together in-process so the
 * real protocol code can run without any actual network I/O.
 */
export class FakeSocket extends EventEmitter {
  private peerRef: FakeSocket | null = null;
  private ended = false;

  setPeer(peer: FakeSocket) {
    this.peerRef = peer;
  }

  write(chunk: Buffer): boolean {
    if (this.ended) return false;
    // Deliver asynchronously so this behaves like a real socket, not a
    // same-tick reentrant call.
    queueMicrotask(() => this.peerRef?.emit('data', chunk));
    return true;
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
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

export function createSocketPair(): [FakeSocket, FakeSocket] {
  const a = new FakeSocket();
  const b = new FakeSocket();
  a.setPeer(b);
  b.setPeer(a);
  return [a, b];
}
