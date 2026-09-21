import { useEffect } from 'react';
import { useStore } from './store';
import { api } from './api/bridge';
import { applyTheme, resolveTheme, systemPrefersDark } from './theme';

/**
 * Keeps the document (and Electron's native chrome) in sync with the Theme
 * setting. Re-runs when the setting changes and, while it is "system", when the
 * OS switches appearance underneath us.
 */
export function useApplyTheme(): void {
  const theme = useStore((s) => s.settings?.theme);

  useEffect(() => {
    if (!theme) return;

    const apply = () => applyTheme(document, resolveTheme(theme, systemPrefersDark(window)));
    apply();
    void api.main.setTheme(theme).catch(() => undefined);

    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
