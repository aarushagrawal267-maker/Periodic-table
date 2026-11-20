import { defineConfig } from 'vitest/config';

// Emulator suites (docs/ACCOUNTS.md 6.5): security rules (tests-emulator/rules.test.ts) and account sync
// with simulated devices (tests-emulator/sync.test.ts). Run with `npm run test:accounts`, which starts the
// auth and Firestore emulators first. The default `npx vitest run` (vitest.config.ts) never picks these up.
export default defineConfig({
  test: {
    include: ['tests-emulator/**/*.test.ts'],
    // A sync test starts several devices and waits on real saves (2 s debounce each).
    testTimeout: 90_000,
    hookTimeout: 30_000,
    // rules.test.ts clears the whole Firestore emulator before each test: never alongside the sync tests.
    fileParallelism: false,
  },
});
