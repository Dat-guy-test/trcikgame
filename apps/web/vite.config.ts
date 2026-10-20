import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // Relative asset paths + the hash router: the build works from any folder (GitHub Pages project sites, Netlify, a plain file server).
  base: './',
  server: { fs: { allow: ['../..'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 120, sourcemap: true },
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'], testTimeout: 60_000 },
});
