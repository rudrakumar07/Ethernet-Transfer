import { MAX_CONTROL_PAYLOAD, FrameType, type FrameTypeValue } from '../../../shared/protocol';

export interface DecodedFrame {
  type: FrameTypeValue;
  payload: Buffer;
}

/**
 * Incremental frame decoder for the [type:1][length:4][payload] wire format.
 * Pure logic: feed it bytes as they arrive, drain complete frames.
 */
export class FrameDecoder {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): DecodedFrame[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
    const frames: DecodedFrame[] = [];
    for (;;) {
      if (this.buffer.length < 5) break;
      const type = this.buffer.readUInt8(0) as FrameTypeValue;
      const length = this.buffer.readUInt32BE(1);
      const maxAllowed = type === FrameType.DATA ? MAX_CONTROL_PAYLOAD : MAX_CONTROL_PAYLOAD;
      if (length > maxAllowed) {
        throw new Error('frame-too-large');
      }
      if (this.buffer.length < 5 + length) break;
      const payload = this.buffer.subarray(5, 5 + length);
      frames.push({ type, payload: Buffer.from(payload) });
      this.buffer = this.buffer.subarray(5 + length);
    }
    return frames;
  }

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}
