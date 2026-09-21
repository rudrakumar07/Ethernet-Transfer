import { app, dialog, nativeTheme, shell, type BrowserWindow } from 'electron';
import type { MainCommands } from '../shared/ipc-contract';

export interface MainCommandsHandle extends MainCommands {
  /** Read by the window's close handler, which cannot await an IPC round trip. */
  shouldMinimizeToTray(): boolean;
}

export function createMainCommands(win: BrowserWindow): MainCommandsHandle {
  let minimizeToTray = true;
  return {
    shouldMinimizeToTray: () => minimizeToTray,
    async setMinimizeToTray(enabled) {
      minimizeToTray = enabled;
    },
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
    async setTheme(theme) {
      nativeTheme.themeSource = theme;
    },
  };
}
