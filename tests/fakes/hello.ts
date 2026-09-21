import { PROTOCOL_VERSION, FrameType, encodeControlFrame, type Hello } from '../../src/shared/protocol';

export function testHello(name: string): Omit<Hello, 'protocolVersion'> {
  return { appVersion: '0.1.0-test', deviceId: `device-${name}`, name, os: 'linux' };
}

/**
 * A well-formed HELLO frame for a scripted peer. Tests used to inline
 * `protocolVersion: 1`, so bumping the protocol silently turned every one of
 * them into a version-mismatch test.
 */
export function helloFrame(name: string): Buffer {
  return encodeControlFrame(FrameType.HELLO, { ...testHello(name), protocolVersion: PROTOCOL_VERSION });
}
