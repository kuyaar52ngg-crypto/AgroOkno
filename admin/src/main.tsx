import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout.css';

import { App } from './App';
import { missingConfig } from './api/config';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './ui/ToastProvider';

const root = createRoot(document.getElementById('root') as HTMLElement);
const missing = missingConfig();

if (missing.length > 0) {
  root.render(
    <div className="auth-screen">
      <div className="auth-card">
        <h1 className="auth-title">Панель не настроена</h1>
        <p className="muted">Не заданы переменные окружения:</p>
        <ul>
          {missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Скопируйте <code>.env.example</code> в <code>.env.local</code> и заполните значения (см. README). На Vercel переменные задаются в настройках проекта.
        </p>
      </div>
    </div>,
  );
} else {
  root.render(
    <StrictMode>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
