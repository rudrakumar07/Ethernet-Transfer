import React, { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { api } from '../../api/bridge';
import {
  Button,
  CopyIcon,
  FolderIcon,
  PageHeader,
  PaletteIcon,
  PowerIcon,
  Select,
  SettingsCard,
  ShieldIcon,
  TextInput,
  ToggleSwitch,
  TrayIcon,
  UserIcon,
} from '../../components/ui';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-[14px] font-semibold text-fg mb-1.5">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsScreen() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  // Local draft so typing a device name doesn't rewrite settings.json (and
  // re-announce this device over the network) on every single keystroke.
  const [nameDraft, setNameDraft] = useState(settings?.deviceName ?? '');
  const [copied, setCopied] = useState(false);

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
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="flex flex-col gap-7 px-8 py-7 max-w-4xl">
        <PageHeader title="Settings" />

        <Group title="Identity">
          <SettingsCard
            icon={<UserIcon size={20} />}
            title="Device name"
            description="How this machine appears to other devices"
            control={
              <TextInput
                aria-label="Device name"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    setNameDraft(settings.deviceName);
                    e.currentTarget.blur();
                  }
                }}
                className="!w-64"
              />
            }
          />
        </Group>

        <Group title="Transfers">
          <SettingsCard
            icon={<FolderIcon size={20} />}
            title="Download folder"
            description={<span className="font-mono break-all">{settings.downloadDir}</span>}
            control={
              <>
                <Button variant="subtle" onClick={() => void api.main.openDownloadFolder().catch(() => undefined)}>
                  Open
                </Button>
                <Button
                  onClick={async () => {
                    const dir = await api.main.pickFolder();
                    if (dir) await updateSettings({ downloadDir: dir });
                  }}
                >
                  Change
                </Button>
              </>
            }
          />
          <SettingsCard
            icon={<ShieldIcon size={20} />}
            title="Auto-accept from trusted devices"
            description="Trusted devices can send without asking each time"
            control={
              <ToggleSwitch
                label="Auto-accept from trusted devices"
                checked={settings.autoAcceptTrusted}
                onChange={(checked) => void updateSettings({ autoAcceptTrusted: checked })}
              />
            }
          />
        </Group>

        <Group title="Appearance">
          <SettingsCard
            icon={<PaletteIcon size={20} />}
            title="Theme"
            description="Follow Windows, or always use light or dark"
            control={
              <Select
                label="Theme"
                value={settings.theme}
                onChange={(theme) => void updateSettings({ theme })}
                options={[
                  { value: 'system', label: 'Use system setting' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            }
          />
        </Group>

        <Group title="System">
          <SettingsCard
            icon={<PowerIcon size={20} />}
            title="Start on login"
            description="Open EtherTransfer when you sign in"
            control={
              <ToggleSwitch
                label="Start on login"
                checked={settings.startOnLogin}
                onChange={async (checked) => {
                  await api.main.setStartOnLogin(checked);
                  await updateSettings({ startOnLogin: checked });
                }}
              />
            }
          />
          <SettingsCard
            icon={<TrayIcon size={20} />}
            title="Minimize to tray on close"
            description="Closing the window keeps EtherTransfer running in the background"
            control={
              <ToggleSwitch
                label="Minimize to tray on close"
                checked={settings.minimizeToTray}
                onChange={async (checked) => {
                  await api.main.setMinimizeToTray(checked);
                  await updateSettings({ minimizeToTray: checked });
                }}
              />
            }
          />
        </Group>

        <Group title="Troubleshooting">
          <SettingsCard
            icon={<CopyIcon size={20} />}
            title="Diagnostics"
            description="Device and network details for a bug report, with your download path removed"
            control={
              <Button
                onClick={async () => {
                  const diag = await api.core.getDiagnostics();
                  await navigator.clipboard.writeText(diag);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            }
          />
        </Group>
      </div>
    </div>
  );
}
