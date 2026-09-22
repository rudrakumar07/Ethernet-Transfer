import { app, dialog, nativeTheme, shell, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import type { MainCommands } from '../shared/ipc-contract';

export interface MainCommandsHandle extends MainCommands {
  /** Read by the window's close handler, which cannot await an IPC round trip. */
  shouldMinimizeToTray(): boolean;
}

export function createMainCommands(
  win: BrowserWindow,
  deps: { downloadDir: () => Promise<string> },
): MainCommandsHandle {
  let minimizeToTray = true;
  return {
    async openDownloadFolder() {
      // The path comes from the core's settings, never from the renderer, so a
      // compromised page cannot aim openPath at an arbitrary file or program.
      const dir = await deps.downloadDir();
      await fs.mkdir(dir, { recursive: true });
      const error = await shell.openPath(dir);
      if (error) throw new Error(error);
    },
    shouldMinimizeToTray: () => minimizeToTray,
    async setMinimizeToTray(enabled) {
      minimizeToTray = enabled;
    },
    async pickFiles() {
      const result = await dialog.showOpenDialog(win, {
        title: 'Choose files to send',
        buttonLabel: 'Send',
        properties: ['openFile', 'multiSelections'],
      });
      return result.canceled ? [] : result.filePaths;
    },
    async pickFolders() {
      const result = await dialog.showOpenDialog(win, {
        title: 'Choose folders to send',
        buttonLabel: 'Send',
        properties: ['openDirectory', 'multiSelections'],
      });
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
