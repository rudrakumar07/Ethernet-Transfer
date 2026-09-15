import React from 'react';
import { useStore } from '../../store';
import { api } from '../../api/bridge';
import { Button } from '../../components/ui';

export function SettingsScreen() {
  const { settings, updateSettings } = useStore();
  if (!settings) return null;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-md text-sm">
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Device name</label>
        <input className="border rounded px-2 py-1 w-full bg-transparent" value={settings.deviceName}
          onChange={(e) => void updateSettings({ deviceName: e.target.value })} />
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Download folder</label>
        <div className="flex gap-2">
          <input className="border rounded px-2 py-1 flex-1 bg-transparent" value={settings.downloadDir} readOnly />
          <Button variant="ghost" onClick={async () => {
            const dir = await api.main.pickFolder();
            if (dir) await updateSettings({ downloadDir: dir });
          }}>Change</Button>
        </div>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.autoAcceptTrusted}
          onChange={(e) => void updateSettings({ autoAcceptTrusted: e.target.checked })} />
        Auto-accept from trusted devices
      </label>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Theme</label>
        <select className="border rounded px-2 py-1 bg-transparent" value={settings.theme}
          onChange={(e) => void updateSettings({ theme: e.target.value as typeof settings.theme })}>
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.startOnLogin}
          onChange={async (e) => {
            await api.main.setStartOnLogin(e.target.checked);
            await updateSettings({ startOnLogin: e.target.checked });
          }} />
        Start on login
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={settings.minimizeToTray}
          onChange={(e) => void updateSettings({ minimizeToTray: e.target.checked })} />
        Minimize to tray on close
      </label>
      <Button variant="ghost" onClick={async () => {
        const diag = await api.core.getDiagnostics();
        await navigator.clipboard.writeText(diag);
      }}>Copy diagnostics</Button>
    </div>
  );
}
