import React from 'react';
import ReactDOM from 'react-dom/client';
import Player from './Player';
import '../styles/globals.css';
import { initAppearance } from '@/hooks/useSettings';

initAppearance();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Player />
  </React.StrictMode>
);
