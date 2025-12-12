import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      sourcemap: true,
      outDir: 'out/main',
      rollupOptions: {
        external: [
          'pouchdb',
          'pouchdb-load',
          'pouchdb-replication-stream',
          'extract-file-icon',
          'uiohook-napi',
          'node-key-sender',
          'electron-screenshots',
          'simple-plist',
          'original-fs',
          'fs-extra',
        ],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      sourcemap: true,
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: path.resolve(__dirname, 'src/renderer'),
    publicDir: path.resolve(__dirname, 'public'),
    build: {
      sourcemap: true,
      outDir: 'out/renderer',
      rollupOptions: {
        external: [
          'electron',
          '@electron/remote',
          'original-fs',
          'electron-clipboard-ex',
          'extract-file-icon',
          'path',
          'fs',
          'os',
          'child_process',
        ],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [vue()],
    optimizeDeps: {
      exclude: [
        'electron',
        '@electron/remote',
        'original-fs',
        'electron-clipboard-ex',
        'extract-file-icon',
        'plist',
        'path',
        'fs',
        'os',
        'child_process',
      ],
    },
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
        },
      },
    },
  },
});
