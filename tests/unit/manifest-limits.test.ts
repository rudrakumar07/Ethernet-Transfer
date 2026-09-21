import { describe, it, expect } from 'vitest';
import { FrameDecoder } from '../../src/core/transfer/protocol/framing';
import {
  FrameType,
  MAX_CONTROL_PAYLOAD,
  MAX_MANIFEST_PAYLOAD,
  encodeControlFrame,
} from '../../src/shared/protocol';
import type { TransferItem } from '../../src/shared/types';

function frame(type: number, payloadBytes: number): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(payloadBytes, 1);
  return Buffer.concat([header, Buffer.alloc(payloadBytes, 1)]);
}

/**
 * Sending a whole folder puts its entire item list in one OFFER frame. Against
 * the old flat 1 MiB ceiling a ~8,000-file folder produced a 1.1 MiB manifest
 * and threw frame-too-large, so any real photo or project folder failed to
 * send. Manifests get their own, larger ceiling; everything else stays tight.
 */
describe('frame size limits by type', () => {
  it('accepts a manifest frame larger than the control limit', () => {
    const decoder = new FrameDecoder();
    const big = MAX_CONTROL_PAYLOAD + 64 * 1024;
    expect(big).toBeLessThanOrEqual(MAX_MANIFEST_PAYLOAD);
    const frames = decoder.push(frame(FrameType.OFFER, big));
    expect(frames).toHaveLength(1);
    expect(frames[0].payload.byteLength).toBe(big);
  });

  it('still rejects a manifest beyond the manifest ceiling', () => {
    const decoder = new FrameDecoder();
    expect(() => decoder.push(frame(FrameType.OFFER, MAX_MANIFEST_PAYLOAD + 1))).toThrow('frame-too-large');
  });

  it('keeps ordinary control frames at the tighter limit', () => {
    const decoder = new FrameDecoder();
    expect(() => decoder.push(frame(FrameType.ACCEPT, MAX_CONTROL_PAYLOAD + 1))).toThrow('frame-too-large');
  });

  it('keeps DATA frames at the chunk limit', () => {
    const decoder = new FrameDecoder();
    expect(() => decoder.push(frame(FrameType.DATA, MAX_CONTROL_PAYLOAD + 1))).toThrow('frame-too-large');
  });

  it('encodes a 20,000-file folder manifest without throwing', () => {
    const items: TransferItem[] = Array.from({ length: 20_000 }, (_, i) => ({
      index: i,
      relPath: `holiday/2024/album${i % 50}/photo_${i}_original.jpeg`,
      kind: 'file' as const,
      size: 4_500_000,
      mtimeMs: 1_700_000_000_000,
    }));
    const encoded = encodeControlFrame(FrameType.OFFER, {
      transferId: 'x'.repeat(36),
      items,
      totalBytes: items.length * 4_500_000,
      fileCount: items.length,
    });
    expect(encoded.byteLength).toBeGreaterThan(MAX_CONTROL_PAYLOAD);
    // and it round-trips through the decoder
    expect(new FrameDecoder().push(encoded)).toHaveLength(1);
  });
});
