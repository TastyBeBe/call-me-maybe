import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { spustAktualizace } from './aktualizace';
import './styles.css';

// Otevřená appka si sama načte novou verzi, jakmile je nasazená (Albert 21. 10. 2026, src/aktualizace.ts).
spustAktualizace();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
);
