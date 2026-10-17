import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [tailwindcss()],
  base: './',
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  preview: { proxy: { '/api': 'http://127.0.0.1:4180' } },
  build: { target: 'es2022', emptyOutDir: false },
});
