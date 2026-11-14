import React from 'react';
import ReactDOM from 'react-dom/client';
import Settings from './Settings';
import '../styles/globals.css';
import { initAppearance } from '@/hooks/useSettings';

initAppearance();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>
);
