import type { Hello } from '../../src/shared/protocol';

export function testHello(name: string): Omit<Hello, 'protocolVersion'> {
  return { appVersion: '0.1.0-test', deviceId: `device-${name}`, name, os: 'linux' };
}
