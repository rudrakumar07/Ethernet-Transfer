import type { Logger } from '../../src/core/ports';

export function createSilentLogger(): Logger {
  return { debug() {}, info() {}, warn() {}, error() {} };
}
