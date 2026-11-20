/**
 * Mounts the account screen the way phase 2 will (bootAccounts before the first render), and exposes the
 * stores and the account API to Playwright as window.__periodica. Test-only: loaded by harness.html.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/figtree';
import '@fontsource-variable/geist-mono';
import '../src/styles/index.css';
import * as account from '../src/lib/account';
import * as syncMeta from '../src/lib/syncMeta';
import { Account } from '../src/screens/Account';
import { useAuth } from '../src/store/auth';
import { useProgress } from '../src/store/progress';
import { useSettings } from '../src/store/settings';

account.bootAccounts();
Object.assign(window, { __periodica: { useAuth, useProgress, useSettings, account, syncMeta } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main id="main" tabIndex={-1} className="outline-none">
      <Account />
    </main>
  </StrictMode>,
);
