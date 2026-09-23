import path from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: {
          index: 'src/main/index.ts',
          'core-entry': 'src/core/entry.ts',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: {
          index: 'src/preload/index.ts',
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    // One source for the About section: package.json, not a string typed twice.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_AUTHOR__: JSON.stringify(pkg.author),
    },
    build: {
      outDir: path.resolve(__dirname, 'dist/renderer'),
      rollupOptions: {
        input: 'src/renderer/index.html',
      },
    },
  },
});
