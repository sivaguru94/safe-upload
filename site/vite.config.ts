import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const headers = JSON.parse(readFileSync(new URL('./security-headers.json', import.meta.url), 'utf8')) as Record<string, string>;

export default defineConfig({
  base: '/',
  define: { __CSP__: JSON.stringify(headers['Content-Security-Policy']) },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0, sourcemap: false },
  // The dev server needs inline styles for HMR, so only preview mirrors production headers exactly.
  preview: { headers },
});
