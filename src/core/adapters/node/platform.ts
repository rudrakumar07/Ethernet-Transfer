import os from 'node:os';
import type { Platform } from '../../ports';

export function createNodePlatform(dataDir: string, appVersion: string): Platform {
  return {
    hostname: () => os.hostname(),
    osName: () => {
      switch (process.platform) {
        case 'win32':
          return 'windows';
        case 'darwin':
          return 'macos';
        case 'linux':
          return 'linux';
        default:
          return 'unknown';
      }
    },
    appVersion: () => appVersion,
    dataDir: () => dataDir,
    homeDir: () => os.homedir(),
  };
}
