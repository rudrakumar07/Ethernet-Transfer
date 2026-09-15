import log from 'electron-log/node';
import type { Logger } from '../../ports';

export function createNodeLogger(logFilePath: string): Logger {
  log.transports.file.resolvePathFn = () => logFilePath;
  log.transports.file.maxSize = 5 * 1024 * 1024;
  return {
    debug: (m, meta) => log.debug(m, meta ?? ''),
    info: (m, meta) => log.info(m, meta ?? ''),
    warn: (m, meta) => log.warn(m, meta ?? ''),
    error: (m, meta) => log.error(m, meta ?? ''),
  };
}
