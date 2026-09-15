import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { CoreEventName } from '../shared/ipc-contract';

const CORE_COMMAND_METHODS = [
  'getSnapshot', 'sendFiles', 'connectByAddress', 'respondToOffer', 'pauseTransfer',
  'resumeTransfer', 'cancelTransfer', 'retryTransfer', 'discardTransfer', 'setTrusted',
  'getSettings', 'updateSettings', 'getStats', 'getDiagnostics',
] as const;

const core: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
for (const method of CORE_COMMAND_METHODS) {
  core[method] = (...args: unknown[]) => ipcRenderer.invoke(`core:${method}`, ...args);
}

const main = {
  pickFiles: () => ipcRenderer.invoke('main:pickFiles'),
  pickFolder: () => ipcRenderer.invoke('main:pickFolder'),
  showInFolder: (path: string) => ipcRenderer.invoke('main:showInFolder', path),
  setStartOnLogin: (enabled: boolean) => ipcRenderer.invoke('main:setStartOnLogin', enabled),
};

function onEvent(name: CoreEventName, listener: (payload: unknown) => void): () => void {
  const wrapped = (_e: unknown, payload: unknown) => listener(payload);
  ipcRenderer.on(`core-event:${name}`, wrapped);
  return () => ipcRenderer.removeListener(`core-event:${name}`, wrapped);
}

contextBridge.exposeInMainWorld('etherTransfer', {
  core,
  main,
  onEvent,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
