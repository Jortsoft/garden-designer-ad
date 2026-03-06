import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: 'offline',
    emptyOutDir: true,
    copyPublicDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(currentDir, 'src/main.ts'),
      name: 'GardenDesignerAd',
      formats: ['iife'],
      fileName: () => 'app',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
