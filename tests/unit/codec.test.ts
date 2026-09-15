import { describe, it, expect } from 'vitest';
import { decodeControlPayload } from '../../src/core/transfer/protocol/codec';
import { FrameType } from '../../src/shared/protocol';

describe('decodeControlPayload', () => {
  it('decodes and validates a well-formed HELLO payload', () => {
    const payload = Buffer.from(
      JSON.stringify({ protocolVersion: 1, appVersion: '0.1.0', deviceId: 'x', name: 'Y', os: 'windows' }),
      'utf8',
    );
    const result = decodeControlPayload(FrameType.HELLO, payload);
    expect(result).toMatchObject({ protocolVersion: 1, os: 'windows' });
  });

  it('throws on malformed JSON', () => {
    expect(() => decodeControlPayload(FrameType.HELLO, Buffer.from('not json'))).toThrow('malformed-message');
  });

  it('throws when a required field is missing', () => {
    const payload = Buffer.from(JSON.stringify({ protocolVersion: 1 }), 'utf8');
    expect(() => decodeControlPayload(FrameType.HELLO, payload)).toThrow();
  });

  it('throws for a frame type with no known schema', () => {
    const payload = Buffer.from(JSON.stringify({}), 'utf8');
    expect(() => decodeControlPayload(FrameType.DATA, payload)).toThrow('malformed-message');
  });

  it('rejects an unknown enum value', () => {
    const payload = Buffer.from(JSON.stringify({ reason: 'not-a-real-reason' }), 'utf8');
    expect(() => decodeControlPayload(FrameType.DECLINE, payload)).toThrow();
  });
});
