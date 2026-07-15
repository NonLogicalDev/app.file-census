import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const sourceFile = (file) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: sourceFile('index.html'),
        preview: sourceFile('preview.html')
      }
    }
  }
});
