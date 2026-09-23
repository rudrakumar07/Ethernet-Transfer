import { app, ipcMain, Menu, Notification } from 'electron';
import { createMainWindow } from './window';
import { createTray } from './tray';
import { createMainCommands } from './dialogs';
import { createCoreHost } from './core-host';
import type { CoreEventName } from '../shared/ipc-contract';

const CORE_COMMAND_METHODS = [
  'getSnapshot', 'sendFiles', 'respondToOffer', 'pauseTransfer',
  'resumeTransfer', 'cancelTransfer', 'retryTransfer', 'discardTransfer', 'setTrusted',
  'getSettings', 'updateSettings', 'getStats', 'getDiagnostics',
];

app.whenReady().then(() => {
  // Electron installs a stock File/Edit/View/Window/Help menu, which has no
  // place in this app. macOS still needs one, or the standard clipboard and
  // quit shortcuts stop working.
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
    );
  } else {
    Menu.setApplicationMenu(null);
  }

  // The standard About panel (EtherTransfer > About on macOS, Help > About on
  // Linux). Without this it showed the copyright only in a packaged build and
  // never the creator.
  app.setAboutPanelOptions({
    applicationName: 'EtherTransfer',
    applicationVersion: app.getVersion(),
    copyright: `Copyright © 2026 ${__APP_AUTHOR__}`,
    credits: `Created by ${__APP_AUTHOR__}`,
    authors: [__APP_AUTHOR__],
  });

  const win = createMainWindow();
  const tray = createTray(win);
  const core = createCoreHost();
  const mainCommands = createMainCommands(win, {
    downloadDir: async () => (await core.call<{ downloadDir: string }>('getSettings', [])).downloadDir,
  });

  for (const method of CORE_COMMAND_METHODS) {
    ipcMain.handle(`core:${method}`, (_e, ...args) => core.call(method, args));
  }
  ipcMain.handle('main:pickFiles', () => mainCommands.pickFiles());
  ipcMain.handle('main:pickFolders', () => mainCommands.pickFolders());
  ipcMain.handle('main:pickFolder', () => mainCommands.pickFolder());
  ipcMain.handle('main:showInFolder', (_e, p: string) => mainCommands.showInFolder(p));
  ipcMain.handle('main:setStartOnLogin', (_e, enabled: boolean) => mainCommands.setStartOnLogin(enabled));
  ipcMain.handle('main:setTheme', (_e, theme: 'system' | 'light' | 'dark') => mainCommands.setTheme(theme));
  ipcMain.handle('main:setMinimizeToTray', (_e, enabled: boolean) => mainCommands.setMinimizeToTray(enabled));
  ipcMain.handle('main:openDownloadFolder', () => mainCommands.openDownloadFolder());

  const forwardedEvents: CoreEventName[] = [
    'devices:changed', 'transfer:updated', 'transfer:removed', 'offer:incoming', 'offer:closed', 'stats:tick', 'core:status',
  ];
  for (const name of forwardedEvents) {
    core.on(name, (payload) => {
      // The core keeps emitting (a stats tick every 500 ms) after the window is
      // gone - while quitting on any platform, and on macOS after closing it -
      // and touching a destroyed window's webContents throws.
      if (!win.isDestroyed()) win.webContents.send(`core-event:${name}`, payload);
    });
  }

  core.on('offer:incoming', (payload) => {
    const offer = payload as { deviceName: string; fileCount: number };
    if (!win.isDestroyed() && !win.isFocused()) {
      new Notification({
        title: 'EtherTransfer',
        body: `${offer.deviceName} wants to send you ${offer.fileCount} file(s)`,
      }).show();
    }
  });

  // Closing the window hid it unconditionally, so the "Minimize to tray on
  // close" setting had no effect and the app could not be closed at all.
  core
    .call<{ minimizeToTray: boolean }>('getSettings', [])
    .then((s) => mainCommands.setMinimizeToTray(s.minimizeToTray))
    .catch(() => undefined);

  let quitting = false;
  app.on('before-quit', () => {
    quitting = true;
  });

  win.on('close', (e) => {
    if (quitting) return;
    if (mainCommands.shouldMinimizeToTray()) {
      e.preventDefault();
      win.hide();
      return;
    }
    // Not keeping it in the tray: closing the window quits. On macOS it used
    // to be destroyed while the app kept running - Electron does not quit
    // there when the last window closes - leaving nothing to reopen and a
    // destroyed window still receiving events.
    if (process.platform === 'darwin') {
      e.preventDefault();
      app.quit();
    }
  });

  // Clicking the Dock icon brings the hidden window back (macOS).
  app.on('activate', () => {
    if (!win.isDestroyed()) win.show();
  });

  void tray;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
