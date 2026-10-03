import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App';
import './index.css';

// Attach the logged-in user as an actor header on every API request so the
// backend Audit Log records who performed each action automatically.
axios.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem('kasirku_user');
    if (raw) {
      const u = JSON.parse(raw);
      config.headers = config.headers || {};
      if (u?.username) config.headers['x-actor'] = u.username;
      if (u?.id) config.headers['x-actor-id'] = u.id;
    }
    // Backend validates admin-only endpoints and the checkout cashier from
    // this token, so attach it to every API request.
    const token = localStorage.getItem('kasirku_token');
    if (token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  } catch { /* ignore */ }
  return config;
});

// Sesi kedaluwarsa / user dinonaktifkan / token dicabut -> server menjawab 401.
// Bersihkan sesi lokal dan arahkan ke halaman login yang sesuai.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    try {
      const status = error?.response?.status;
      const hasSession = !!localStorage.getItem('kasirku_token');
      if (status === 401 && hasSession) {
        localStorage.removeItem('kasirku_token');
        localStorage.removeItem('kasirku_user');
        const path = window.location.pathname;
        const onLoginPage = path.startsWith('/kiosk/login') || path.startsWith('/admin-login');
        if (!onLoginPage) {
          window.location.assign(path.startsWith('/kiosk') ? '/kiosk/login' : '/admin-login');
        }
      }
    } catch { /* ignore */ }
    return Promise.reject(error);
  }
);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
