import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './App.css'

const rootEl = document.getElementById('root');
const splash = document.getElementById('splash-screen');

function removeSplash() {
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 500);
  }
}

try {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  setTimeout(removeSplash, 1000);
} catch (err) {
  console.error('React mount failed:', err);
  setTimeout(removeSplash, 500);
  rootEl.innerHTML = `
    <div style="color:#e2e8f0;padding:40px;font-family:sans-serif;text-align:center;">
      <h2>App failed to load</h2>
      <p style="color:#94a3b8">${err?.message || 'Unknown error'}</p>
      <button onclick="location.reload()" style="margin-top:20px;padding:12px 24px;border-radius:10px;background:#38bdf8;color:#0f172a;border:none;font-weight:600;cursor:pointer;">Reload</button>
    </div>
  `;
}
setTimeout(removeSplash, 5000);