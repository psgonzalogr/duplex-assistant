import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    target: 'chrome130',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2500,
  },
});
