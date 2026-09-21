import React, { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { api } from '../../api/bridge';
import { Button, Checkbox, Field, PageHeader, Section, Select, TextInput } from '../../components/ui';

export function SettingsScreen() {
  const { settings, updateSettings } = useStore();
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
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-lg">
        <PageHeader title="Settings" />

        <div className="space-y-7">
          <Section title="Identity">
            <Field label="Device name" hint="How this machine appears to other devices.">
              <TextInput
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            </Field>
          </Section>

          <Section title="Transfers">
            <Field label="Download folder" hint="Where received files and folders are saved.">
              <div className="flex gap-2">
                <TextInput value={settings.downloadDir} readOnly className="flex-1 font-mono text-xs" />
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const dir = await api.main.pickFolder();
                    if (dir) await updateSettings({ downloadDir: dir });
                  }}
                >
                  Change
                </Button>
              </div>
            </Field>
            <Checkbox
              checked={settings.autoAcceptTrusted}
              onChange={(checked) => void updateSettings({ autoAcceptTrusted: checked })}
              label="Auto-accept from trusted devices"
              hint="Trusted devices can send without asking each time."
            />
          </Section>

          <Section title="Appearance">
            <Field label="Theme">
              <Select
                value={settings.theme}
                onChange={(theme) => void updateSettings({ theme })}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </Field>
          </Section>

          <Section title="System">
            <Checkbox
              checked={settings.startOnLogin}
              onChange={async (checked) => {
                await api.main.setStartOnLogin(checked);
                await updateSettings({ startOnLogin: checked });
              }}
              label="Start on login"
            />
            <Checkbox
              checked={settings.minimizeToTray}
              onChange={async (checked) => {
                await api.main.setMinimizeToTray(checked);
                await updateSettings({ minimizeToTray: checked });
              }}
              label="Minimize to tray on close"
              hint="Closing the window keeps EtherTransfer running in the background."
            />
          </Section>

          <Section title="Troubleshooting">
            <div>
              <Button
                variant="ghost"
                onClick={async () => {
                  const diag = await api.core.getDiagnostics();
                  await navigator.clipboard.writeText(diag);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'Copied to clipboard' : 'Copy diagnostics'}
              </Button>
              <div className="text-[11px] text-neutral-500 mt-1.5">
                Device and network details, with your download path removed.
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
