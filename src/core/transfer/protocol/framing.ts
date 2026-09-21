import { MAX_MANIFEST_PAYLOAD, maxPayloadFor, type FrameTypeValue } from '../../../shared/protocol';

export interface DecodedFrame {
  type: FrameTypeValue;
  payload: Buffer;
}

/**
 * Incremental frame decoder for the [type:1][length:4][payload] wire format.
 * Pure logic: feed it bytes as they arrive, drain complete frames.
 */
export class FrameDecoder {
  private chunks: Buffer[] = [];
  private buffered = 0;
  private joined: Buffer | null = null;

  push(chunk: Buffer): DecodedFrame[] {
    if (chunk.length === 0) return [];
    this.chunks.push(chunk);
    this.buffered += chunk.length;
    this.joined = null;

    const frames: DecodedFrame[] = [];
    for (;;) {
      if (this.buffered < 5) break;
      const header = this.peek(5);
      const type = header.readUInt8(0) as FrameTypeValue;
      const length = header.readUInt32BE(1);
      // Manifests are allowed to be much larger than ordinary control frames;
      // everything else stays at the tight limit.
      if (length > maxPayloadFor(type)) {
        throw new Error('frame-too-large');
      }
      if (this.buffered < 5 + length) break;
      const full = this.peek(5 + length);
      frames.push({ type, payload: Buffer.from(full.subarray(5, 5 + length)) });
      this.consume(5 + length);
    }
    return frames;
  }

  /**
   * Returns the first `n` buffered bytes. Chunks are kept in a list and only
   * joined when needed - the previous implementation did Buffer.concat of the
   * entire backlog on every single socket chunk, which is quadratic and became
   * the receiver's bottleneck on a fast link.
   */
  private peek(n: number): Buffer {
    void MAX_MANIFEST_PAYLOAD;
    if (this.chunks.length === 1) return this.chunks[0];
    if (!this.joined || this.joined.length < n) {
      this.joined = Buffer.concat(this.chunks, this.buffered);
      this.chunks = [this.joined];
    }
    return this.joined;
  }

  private consume(n: number): void {
    let remaining = n;
    while (remaining > 0 && this.chunks.length) {
      const head = this.chunks[0];
      if (head.length <= remaining) {
        remaining -= head.length;
        this.chunks.shift();
      } else {
        this.chunks[0] = head.subarray(remaining);
        remaining = 0;
      }
    }
    this.buffered -= n;
    this.joined = null;
  }

  reset(): void {
    this.chunks = [];
    this.buffered = 0;
    this.joined = null;
  }
}
