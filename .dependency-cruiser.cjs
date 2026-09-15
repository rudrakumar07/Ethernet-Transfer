/** Enforces the module boundaries in the design spec, §12.1 and §12.2. */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'renderer-no-backend',
      comment: 'renderer must not import core/main/preload/electron directly',
      severity: 'error',
      from: { path: '^src/renderer' },
      to: { path: '^(src/core|src/main|src/preload)|^electron$' },
    },
    {
      name: 'core-no-electron',
      comment: 'core is pure Node and must run under plain Node in tests',
      severity: 'error',
      from: { path: '^src/core' },
      to: { path: '^electron$' },
    },
    // "core-module-no-deep-import": one rule per module (spec §12.2) — code
    // outside a module's own folder may only import its index.ts, never its
    // internals. Written per-module because dependency-cruiser rules can't
    // express "same folder as the importer" generically across modules.
    ...['settings', 'identity', 'trust', 'discovery', 'stats', 'transfer'].map((mod) => ({
      name: `no-deep-import-${mod}`,
      comment: `only src/core/${mod}/index.ts may be imported from outside that folder`,
      severity: 'error',
      from: { path: `^(?!src/core/${mod}/)` },
      to: { path: `^src/core/${mod}/(?!index\\.ts$).+` },
    })),
    {
      name: 'main-no-core-internals',
      comment: 'main spawns the bundled core entry by path only, never imports core modules',
      severity: 'error',
      from: { path: '^src/main' },
      to: { path: '^src/core/(?!entry)' },
    },
    {
      name: 'components-no-store-or-features',
      comment: 'presentational components take props/callbacks only',
      severity: 'error',
      from: { path: '^src/renderer/components' },
      to: { path: '^src/renderer/(store|features)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
