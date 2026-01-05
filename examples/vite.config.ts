import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  server: {
    port: 5173,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'speech-browser-speech': resolve(__dirname, 'speech-browser-speech/index.html'),
        'browser-browser-speech': resolve(__dirname, 'browser-browser-speech/index.html'),
        'transformers-transformers-transformers': resolve(__dirname, 'transformers-transformers-transformers/index.html'),
        'native-native-native': resolve(__dirname, 'native-native-native/index.html'),
        'speech-native-speech': resolve(__dirname, 'speech-native-speech/index.html'),
        'transformers-transformers-speech': resolve(__dirname, 'transformers-transformers-speech/index.html'),
        'native-transformers-speech': resolve(__dirname, 'native-transformers-speech/index.html'),
      },
    },
  },
});
