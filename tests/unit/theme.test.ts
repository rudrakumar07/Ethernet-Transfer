import { describe, it, expect } from 'vitest';
import { resolveTheme, themeClassNames } from '../../src/renderer/theme';

describe('resolveTheme', () => {
  it('follows the OS when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('overrides the OS when set explicitly', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('falls back to light for an unknown stored value', () => {
    expect(resolveTheme('neon' as never, false)).toBe('light');
  });
});

describe('themeClassNames', () => {
  it('adds the dark class only for the dark theme', () => {
    expect(themeClassNames('dark')).toEqual({ add: ['dark'], remove: [] });
    expect(themeClassNames('light')).toEqual({ add: [], remove: ['dark'] });
  });
});
