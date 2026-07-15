import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

import('./App.jsx').then(({ default: App }) => {
  createRoot(document.getElementById('app')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}).catch(showBootError);

function showBootError(error) {
  document.getElementById('app').innerHTML = `<main class="boot-error"><h1>file-census failed to start</h1><pre>${escapeHtml(error?.stack || error?.message || String(error))}</pre></main>`;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
