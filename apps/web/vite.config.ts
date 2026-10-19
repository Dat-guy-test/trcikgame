import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: { fs: { allow: ['../..'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 120 },
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'], testTimeout: 60_000 },
});
