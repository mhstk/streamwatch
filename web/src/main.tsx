// Order matters: the chrome shim and fetch proxy must run before any shared extension module.
import './platform/chrome-shim';
import './platform/fetch-proxy';
import './styles/web.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { initAppearance } from '@/hooks/useSettings';
import App from './App';

initAppearance();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
