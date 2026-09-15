import type { CoreCommands, MainCommands, CoreEventName, CoreEvents } from '../../shared/ipc-contract';

interface WindowBridge {
  core: { [K in keyof CoreCommands]: (...args: Parameters<CoreCommands[K]>) => ReturnType<CoreCommands[K]> };
  main: MainCommands;
  onEvent<K extends CoreEventName>(name: K, listener: (payload: CoreEvents[K]) => void): () => void;
  getPathForFile(file: File): string;
}

declare global {
  interface Window {
    etherTransfer: WindowBridge;
  }
}

/** The ONLY module that touches window.etherTransfer (spec §12.5). */
export const api: WindowBridge = window.etherTransfer;
