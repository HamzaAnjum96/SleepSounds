import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

/** Last-resort recovery screen, so a crash is never a bare blank: offer a
 *  reload that also clears caches in case a stale asset is the cause. */
function AppCrashFallback() {
  const recover = () => {
    if ('caches' in window) {
      caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).finally(() => location.reload());
    } else {
      location.reload();
    }
  };
  return (
    <div className="crash-screen">
      <p className="crash-line">something slipped while loading starlight.</p>
      <button type="button" className="crash-btn" onClick={recover}>reload</button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<AppCrashFallback />}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// Offline support: register the service worker (production only, so dev
// never fights a cache). Best-effort — the app works fine without it.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => { /* offline support is progressive enhancement */ });
  });
}
