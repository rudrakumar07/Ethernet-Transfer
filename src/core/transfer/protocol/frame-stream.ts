import type { Duplex } from 'node:stream';
import { FrameDecoder, type DecodedFrame } from './framing';

/** Turns a socket's 'data' events into an async-iterable stream of decoded frames. */
export function frameStream(socket: Duplex): AsyncIterable<DecodedFrame> {
  const decoder = new FrameDecoder();
  const queue: DecodedFrame[] = [];
  const waiters: ((v: IteratorResult<DecodedFrame>) => void)[] = [];
  let ended = false;
  let error: Error | undefined;

  function push(frame: DecodedFrame) {
    const waiter = waiters.shift();
    if (waiter) waiter({ value: frame, done: false });
    else queue.push(frame);
  }

  socket.on('data', (chunk: Buffer) => {
    try {
      for (const frame of decoder.push(chunk)) push(frame);
    } catch (err) {
      error = err as Error;
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

  return {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<DecodedFrame>> {
          if (error) return Promise.reject(error);
          if (queue.length) return Promise.resolve({ value: queue.shift()!, done: false });
          if (ended) return Promise.resolve({ value: undefined as never, done: true });
          return new Promise((resolve) => waiters.push(resolve));
        },
      };
    },
  };
}
