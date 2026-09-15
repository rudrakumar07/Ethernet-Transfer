import type { Platform } from '../../src/core/ports';

export function createFakePlatform(over: Partial<{
  hostname: string; osName: Platform['osName']; dataDir: string; homeDir: string;
}> = {}): Platform {
  return {
    hostname: () => over.hostname ?? 'test-host',
    osName: () => (over.osName ? over.osName() : 'linux'),
    appVersion: () => '0.1.0-test',
    dataDir: () => over.dataDir ?? '/data',
    homeDir: () => over.homeDir ?? '/home/test',
  };
}
