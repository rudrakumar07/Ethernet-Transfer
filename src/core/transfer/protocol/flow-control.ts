import type { Duplex } from 'node:stream';

/**
 * Writes a frame and waits for the socket to drain when it asks us to.
 *
 * Without this the sender pushed every chunk a file yielded straight into the
 * socket, ignoring write()'s return value. Measured on a 2 GiB file: the whole
 * thing was queued in ~11ms and sat in the socket's write buffer. Progress
 * jumped instantly to 100% while nothing had crossed the wire, FILE_END queued
 * behind gigabytes of backlog so the receiver never confirmed the file, and the
 * buffered bytes were enough to take the core process down - which the UI saw
 * as the transfer stopping and the device disappearing.
 */
export async function writeWithBackpressure(socket: Duplex, frame: Buffer): Promise<void> {
  // A write to a closed socket returns false and 'drain' never follows, so
  // waiting for it would hang the sender forever on a dropped connection.
  if (socket.destroyed || socket.writableEnded) throw new Error('connection-closed');
  if (socket.write(frame)) return;
  await once(socket, 'drain');
}

function once(socket: Duplex, event: 'drain'): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.removeListener(event, onEvent);
      socket.removeListener('close', onEnd);
      socket.removeListener('error', onEnd);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    // A socket that closes or errors while we wait must not leave the sender
    // hanging forever.
    const onEnd = () => {
      cleanup();
      reject(new Error('connection-closed'));
    };
    socket.once(event, onEvent);
    socket.once('close', onEnd);
    socket.once('error', onEnd);
  });
}

/**
 * Half-closes a socket and gives buffered frames a chance to reach the peer
 * before the connection is torn down.
 *
 * Cancelling used to write a CANCEL frame and then immediately destroy() the
 * TLS socket, which truncated the frame in the send buffer. The receiver never
 * learned the transfer had been cancelled, so it sat at "active" forever with
 * an orphaned .etpart on disk.
 */
export function endGracefully(
  socket: Duplex,
  destroy: () => void,
  timeoutMs = 2000,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeListener('close', finish);
      destroy();
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    socket.once('close', finish);
    try {
      socket.end();
    } catch {
      finish();
    }
  });
}
