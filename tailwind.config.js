/** @type {import('tailwindcss').Config} */
// Colours are CSS variables (see src/renderer/styles.css) that swap between the
// light and dark Fluent palettes, so components name a role - `bg-card`,
// `text-fg-2` - rather than pairing every colour with a `dark:` variant.
const v = (name) => `var(--${name})`;

module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Segoe UI Variable Display"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Cascadia Mono"', 'Consolas', 'ui-monospace', 'monospace'],
      },
      colors: {
        shell: v('shell'),
        layer: v('layer'),
        card: { DEFAULT: v('card'), hover: v('card-hover') },
        subtle: { hover: v('subtle-hover'), pressed: v('subtle-pressed') },
        control: { DEFAULT: v('control'), hover: v('control-hover'), stroke: v('control-stroke'), 'stroke-strong': v('control-stroke-strong') },
        stroke: { DEFAULT: v('stroke'), divider: v('divider') },
        fg: { DEFAULT: v('fg'), 2: v('fg-2'), 3: v('fg-3') },
        accent: { DEFAULT: v('accent'), hover: v('accent-hover'), text: v('accent-text'), on: v('on-accent') },
        selected: v('selected'),
        success: { DEFAULT: v('success'), bg: v('success-bg') },
        caution: { DEFAULT: v('caution'), bg: v('caution-bg') },
        critical: { DEFAULT: v('critical'), bg: v('critical-bg') },
        link: {
          direct: v('link-direct'),
          'direct-bg': v('link-direct-bg'),
          wired: v('link-wired'),
          'wired-bg': v('link-wired-bg'),
          wireless: v('link-wireless'),
          'wireless-bg': v('link-wireless-bg'),
        },
      },
      borderRadius: { control: '4px', card: '8px' },
      boxShadow: { card: '0 2px 4px rgba(0, 0, 0, 0.04)', flyout: '0 8px 16px rgba(0, 0, 0, 0.14)', dialog: '0 32px 64px rgba(0, 0, 0, 0.19)' },
    },
  },
  plugins: [],
};
