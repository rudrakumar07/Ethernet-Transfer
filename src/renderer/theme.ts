import type { Settings } from '../shared/types';

export type ThemeSetting = Settings['theme'];
export type ResolvedTheme = 'light' | 'dark';

/**
 * Turns the stored preference into the theme to actually render.
 *
 * The Theme setting used to be written to settings.json and read by nothing at
 * all: Tailwind was configured with `darkMode: 'media'`, so appearance followed
 * the OS and the dropdown had no effect whatsoever.
 */
export function resolveTheme(setting: ThemeSetting, systemPrefersDark: boolean): ResolvedTheme {
  if (setting === 'dark') return 'dark';
  if (setting === 'light') return 'light';
  if (setting === 'system') return systemPrefersDark ? 'dark' : 'light';
  return 'light';
}

/** Classes to add/remove on <html> for a resolved theme (Tailwind `darkMode: 'class'`). */
export function themeClassNames(theme: ResolvedTheme): { add: string[]; remove: string[] } {
  return theme === 'dark' ? { add: ['dark'], remove: [] } : { add: [], remove: ['dark'] };
}

/**
 * Applies a resolved theme to the document. `color-scheme` is what makes native
 * widgets - scrollbars, checkboxes, the select dropdown in Settings - follow
 * along; without it a dark page keeps bright white scrollbars.
 */
export function applyTheme(doc: Document, theme: ResolvedTheme): void {
  const { add, remove } = themeClassNames(theme);
  doc.documentElement.classList.add(...add);
  doc.documentElement.classList.remove(...remove);
  doc.documentElement.dataset.theme = theme;
  doc.documentElement.style.colorScheme = theme;
}

export function systemPrefersDark(win: Window): boolean {
  return Boolean(win.matchMedia?.('(prefers-color-scheme: dark)').matches);
}
