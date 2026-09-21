import { app, ipcMain, Notification } from 'electron';
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
  const win = createMainWindow();
  const tray = createTray(win);
  const mainCommands = createMainCommands(win);
  const core = createCoreHost();

  for (const method of CORE_COMMAND_METHODS) {
    ipcMain.handle(`core:${method}`, (_e, ...args) => core.call(method, args));
  }
  ipcMain.handle('main:pickFiles', () => mainCommands.pickFiles());
  ipcMain.handle('main:pickFolder', () => mainCommands.pickFolder());
  ipcMain.handle('main:showInFolder', (_e, p: string) => mainCommands.showInFolder(p));
  ipcMain.handle('main:setStartOnLogin', (_e, enabled: boolean) => mainCommands.setStartOnLogin(enabled));
  ipcMain.handle('main:setTheme', (_e, theme: 'system' | 'light' | 'dark') => mainCommands.setTheme(theme));
  ipcMain.handle('main:setMinimizeToTray', (_e, enabled: boolean) => mainCommands.setMinimizeToTray(enabled));

  const forwardedEvents: CoreEventName[] = [
    'devices:changed', 'transfer:updated', 'offer:incoming', 'offer:closed', 'stats:tick', 'core:status',
  ];
  for (const name of forwardedEvents) {
    core.on(name, (payload) => {
      win.webContents.send(`core-event:${name}`, payload);
    });
  }

  core.on('offer:incoming', (payload) => {
    const offer = payload as { deviceName: string; fileCount: number };
    if (!win.isFocused()) {
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
    if (quitting || process.platform === 'darwin') return;
    if (!mainCommands.shouldMinimizeToTray()) return;
    e.preventDefault();
    win.hide();
  });

  void tray;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
