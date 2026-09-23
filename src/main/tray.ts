import { Tray, Menu, nativeImage, type BrowserWindow } from 'electron';
import path from 'node:path';

export function createTray(win: BrowserWindow): Tray {
  const iconPath = path.join(__dirname, '../../build/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('EtherTransfer');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open EtherTransfer', click: () => { if (!win.isDestroyed()) win.show(); } },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ]),
  );
  tray.on('click', () => {
    if (!win.isDestroyed()) win.show();
  });
  return tray;
}
