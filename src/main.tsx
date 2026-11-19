import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// One interface family and one partner (docs/DESIGN.md, "Type"): Figtree for the interface, Geist Mono for figures and meta.
import '@fontsource-variable/figtree';
import '@fontsource-variable/geist-mono';
import './styles/index.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
