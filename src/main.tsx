import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// One interface family and one partner (docs/DESIGN.md, "Type"): Figtree for the interface, Geist Mono for figures and meta.
import '@fontsource-variable/figtree';
import '@fontsource-variable/geist-mono';
import './styles/index.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { bootAccounts } from './lib/accountCore';

// Offline cache: when a new version is deployed, take it and reload once, so nobody is left on an old build.
registerSW({ immediate: true });

// Before the first render: every tab follows the others and a finished shared-computer session ends first
// (docs/ACCOUNTS.md 9). It costs a guest no network call. The env check is written out, not isConfigured(), so
// that a build without accounts drops the account layer from the bundle altogether (section 8.3).
if (import.meta.env.VITE_FIREBASE_PROJECT_ID) bootAccounts();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
