import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Refuses a build that would point a real Firebase project at local emulators (docs/ACCOUNTS.md 6.3):
 * such a bundle would send students' passwords and tokens to whatever listens on 127.0.0.1. The app
 * ignores the flag outside dev and demo-* projects anyway (src/lib/firebase.ts); this stops it shipping.
 */
const firebaseEnvGuard: Plugin = {
  name: 'periodica-firebase-env-guard',
  apply: 'build',
  configResolved(config) {
    const { VITE_FIREBASE_EMULATORS: emulators, VITE_FIREBASE_PROJECT_ID: project } = config.env as Record<string, string | undefined>;
    if (emulators === '1' && !String(project ?? '').startsWith('demo-')) {
      throw new Error(`VITE_FIREBASE_EMULATORS=1 is set for project "${project}". Emulators are for demo-* projects only; unset it for this build.`);
    }
  },
};

/**
 * The account layer's modules only declare things at their top level. Saying so lets the bundler leave a module out
 * when nothing uses it, as in a build without accounts, where main.tsx, the header and Settings never reach them
 * (docs/ACCOUNTS.md 8.3). Without it a module stays for its imports' sake (the stores), even with no export used.
 */
const ACCOUNT_LAYER = /\/src\/(lib\/(accountCore|account|authErrors|firebase)\.ts|store\/auth\.ts|components\/account\/[^/]+\.tsx)$/;

export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      treeshake: { moduleSideEffects: (id) => (ACCOUNT_LAYER.test(id) ? false : undefined) },
    },
  },
  // The account SDK is only reached through import(), so the dev server would find it late and reload the
  // page mid-session (and mid-test). Pre-bundle it up front. Dev server only; builds are unaffected.
  optimizeDeps: { include: ['firebase/app', 'firebase/app-check', 'firebase/auth', 'firebase/firestore'] },
  plugins: [
    firebaseEnvGuard,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        // `id` equals the resolved start_url, which is what browsers used before it was set, so installed copies keep their identity.
        id: './',
        name: 'Periodica · Learn the periodic table',
        short_name: 'Periodica',
        description: 'Learn and memorize the periodic table in three-minute lessons, puzzles and quizzes. Free, no sign-up, works offline.',
        lang: 'en',
        dir: 'ltr',
        categories: ['education', 'games'],
        theme_color: '#161513',
        background_color: '#161513',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          // PNG copies for launchers that do not take SVG (drawn by scripts/brand-icons.mjs).
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // The Firebase SDK chunk is only for accounts (docs/ACCOUNTS.md 8.3): not precached for every
        // guest, but cached after first use so a signed-in device can start offline.
        globIgnores: ['**/firebase-sdk-*.js'],
        // Files for crawlers, AI assistants and link previews: not precached, and opening one in a browser that has the
        // service worker shows the file from the network instead of the app shell.
        navigateFallbackDenylist: [/\/(robots\.txt|sitemap\.xml|llms\.txt|og\.png)$/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/firebase-sdk-[^/]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'firebase-sdk', expiration: { maxEntries: 4 } },
          },
        ],
      },
    }),
  ],
});
