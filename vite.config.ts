import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'local-transformers': resolve(__dirname, 'examples/local-transformers/index.html'),
        'server-transformers': resolve(__dirname, 'examples/server-transformers/index.html'),
        'server-native': resolve(__dirname, 'examples/server-native/index.html'),
      },
    },
  },
});
