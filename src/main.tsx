import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// One interface family and one partner (docs/DESIGN.md, "Type"): Figtree for the interface, Geist Mono for figures and meta.
import '@fontsource-variable/figtree';
import '@fontsource-variable/geist-mono';
import './styles/index.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';

// Offline cache: when a new version is deployed, take it and reload once, so nobody is left on an old build.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
