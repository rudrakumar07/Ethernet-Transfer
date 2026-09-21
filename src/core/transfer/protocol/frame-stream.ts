import type { Duplex } from 'node:stream';
import { FrameDecoder, type DecodedFrame } from './framing';

/**
 * How many decoded frames may sit unconsumed before the socket is paused.
 *
 * The receiver awaits a disk write for every DATA frame, but 'data' events kept
 * arriving the whole time and were queued without limit - so on a fast link the
 * process buffered the incoming file in memory rather than applying
 * backpressure to the sender.
 */
const MAX_QUEUED_FRAMES = 16;

/** Turns a socket's 'data' events into an async-iterable stream of decoded frames. */
export function frameStream(socket: Duplex): AsyncIterable<DecodedFrame> {
  const decoder = new FrameDecoder();
  const queue: DecodedFrame[] = [];
  const waiters: ((v: IteratorResult<DecodedFrame>) => void)[] = [];
  let ended = false;
  let error: Error | undefined;
  let pausedByUs = false;

  function push(frame: DecodedFrame) {
    const waiter = waiters.shift();
    if (waiter) waiter({ value: frame, done: false });
    else queue.push(frame);
  }

  function applyBackpressure() {
    if (!pausedByUs && queue.length >= MAX_QUEUED_FRAMES) {
      pausedByUs = true;
      socket.pause();
    } else if (pausedByUs && queue.length === 0) {
      pausedByUs = false;
      socket.resume();
    }
  }

  socket.on('data', (chunk: Buffer) => {
    try {
      for (const frame of decoder.push(chunk)) push(frame);
      applyBackpressure();
    } catch (err) {
      error = err as Error;
      for (const w of waiters.splice(0)) w({ value: undefined as never, done: true });
      socket.destroy();
    }
  });
  socket.on('end', () => {
    ended = true;
    for (const w of waiters.splice(0)) w({ value: undefined as never, done: true });
  });
  socket.on('close', () => {
    ended = true;
    for (const w of waiters.splice(0)) w({ value: undefined as never, done: true });
  });
  socket.on('error', () => {
    ended = true;
    for (const w of waiters.splice(0)) w({ value: undefined as never, done: true });
  });

  return {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<DecodedFrame>> {
          if (queue.length) {
            const value = queue.shift()!;
            applyBackpressure();
            return Promise.resolve({ value, done: false });
          }
          if (error) {
            const err = error;
            error = undefined;
            return Promise.reject(err);
          }
          if (ended) return Promise.resolve({ value: undefined as never, done: true });
          return new Promise((resolve) => waiters.push(resolve));
        },
      };
    },
  };
}
