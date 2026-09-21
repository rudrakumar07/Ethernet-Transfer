import React, { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { api } from '../../api/bridge';
import { Button } from '../../components/ui';

export function SettingsScreen() {
  const { settings, updateSettings } = useStore();
  // Local draft so typing a device name doesn't rewrite settings.json (and
  // re-announce this device over the network) on every single keystroke.
  const [nameDraft, setNameDraft] = useState(settings?.deviceName ?? '');

  useEffect(() => {
    if (settings) setNameDraft(settings.deviceName);
  }, [settings?.deviceName]);

  if (!settings) return null;

  const commitName = () => {
    const next = nameDraft.trim();
    if (!next || next === settings.deviceName) {
      setNameDraft(settings.deviceName);
      return;
    }
    void updateSettings({ deviceName: next });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-md text-sm">
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Device name</label>
        <input
          className="border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1 w-full bg-transparent"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <div className="text-[10px] text-neutral-500 mt-1">How this machine appears to other devices.</div>
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Download folder</label>
        <div className="flex gap-2">
          <input className="border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1 flex-1 bg-transparent" value={settings.downloadDir} readOnly />
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
        <select className="border border-neutral-300 dark:border-neutral-600 rounded px-2 py-1 bg-transparent" value={settings.theme}
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
          onChange={async (e) => {
            await api.main.setMinimizeToTray(e.target.checked);
            await updateSettings({ minimizeToTray: e.target.checked });
          }} />
        Minimize to tray on close
      </label>
      <Button variant="ghost" onClick={async () => {
        const diag = await api.core.getDiagnostics();
        await navigator.clipboard.writeText(diag);
      }}>Copy diagnostics</Button>
    </div>
  );
}
