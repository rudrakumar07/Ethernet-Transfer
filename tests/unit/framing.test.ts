import { describe, it, expect } from 'vitest';
import { FrameDecoder } from '../../src/core/transfer/protocol/framing';
import { encodeControlFrame, encodeDataFrame, FrameType, MAX_CONTROL_PAYLOAD } from '../../src/shared/protocol';

describe('FrameDecoder', () => {
  it('decodes a single complete frame', () => {
    const decoder = new FrameDecoder();
    const frame = encodeControlFrame(FrameType.HELLO, { hello: true });
    const frames = decoder.push(frame);
    expect(frames).toHaveLength(1);
    expect(frames[0].type).toBe(FrameType.HELLO);
    expect(JSON.parse(frames[0].payload.toString('utf8'))).toEqual({ hello: true });
  });

  it('decodes multiple frames arriving in one chunk', () => {
    const decoder = new FrameDecoder();
    const combined = Buffer.concat([
      encodeControlFrame(FrameType.HELLO, { a: 1 }),
      encodeControlFrame(FrameType.DONE, {}),
    ]);
    const frames = decoder.push(combined);
    expect(frames).toHaveLength(2);
    expect(frames[0].type).toBe(FrameType.HELLO);
    expect(frames[1].type).toBe(FrameType.DONE);
  });

  it('reassembles a frame split across multiple chunks', () => {
    const decoder = new FrameDecoder();
    const frame = encodeControlFrame(FrameType.OFFER, { transferId: 'abc' });
    const first = frame.subarray(0, 3);
    const second = frame.subarray(3);
    expect(decoder.push(first)).toHaveLength(0);
    const frames = decoder.push(second);
    expect(frames).toHaveLength(1);
    expect(frames[0].type).toBe(FrameType.OFFER);
  });

  it('reassembles a DATA frame split byte-by-byte', () => {
    const decoder = new FrameDecoder();
    const data = Buffer.from('hello world binary chunk');
    const frame = encodeDataFrame(data);
    let frames: ReturnType<FrameDecoder['push']> = [];
    for (let i = 0; i < frame.length; i++) {
      frames = frames.concat(decoder.push(frame.subarray(i, i + 1)));
    }
    expect(frames).toHaveLength(1);
    expect(frames[0].payload.equals(data)).toBe(true);
  });

  it('throws on a frame exceeding the max payload size', () => {
    const decoder = new FrameDecoder();
    const header = Buffer.alloc(5);
    header.writeUInt8(FrameType.DATA, 0);
    header.writeUInt32BE(MAX_CONTROL_PAYLOAD + 1, 1);
    expect(() => decoder.push(header)).toThrow('frame-too-large');
  });

  it('rejects an oversized control payload at encode time', () => {
    const huge = { blob: 'x'.repeat(MAX_CONTROL_PAYLOAD + 10) };
    expect(() => encodeControlFrame(FrameType.OFFER, huge)).toThrow();
  });
});
