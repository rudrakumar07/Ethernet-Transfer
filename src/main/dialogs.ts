import { app, dialog, shell, type BrowserWindow } from 'electron';
import type { MainCommands } from '../shared/ipc-contract';

export function createMainCommands(win: BrowserWindow): MainCommands {
  return {
    async pickFiles() {
      const result = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] });
      return result.canceled ? [] : result.filePaths;
    },
    async pickFolder() {
      const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
      return result.canceled ? null : result.filePaths[0];
    },
    async showInFolder(path) {
      shell.showItemInFolder(path);
    },
    async setStartOnLogin(enabled) {
      app.setLoginItemSettings({ openAtLogin: enabled });
    },
  };
}
