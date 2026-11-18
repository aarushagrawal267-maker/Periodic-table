import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Unit tests only. Browser tests in e2e/ run with Playwright (`npm run test:e2e`).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts'],
    },
  }),
);
