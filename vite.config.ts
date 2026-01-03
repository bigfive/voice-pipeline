import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    headers: {
      // Required for SharedArrayBuffer (used by some ONNX operations)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers', 'kokoro-js'],
  },
  build: {
    target: 'esnext',
  },
});

