
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * Vite + Vercel Environment Variable Polyfill
 * We check both Vite's standard and the global process.env.
 */
const getEnv = (key: string): string => {
  const viteKey = `VITE_${key}`;
  // @ts-ignore - Vite env
  const fromVite = import.meta.env ? import.meta.env[viteKey] : undefined;
  const fromProcess = (window as any).process?.env?.[key] || (window as any).process?.env?.[viteKey];
  
  return fromVite || fromProcess || "";
};

// Polyfill process.env for the browser
if (typeof (window as any).process === 'undefined') {
  (window as any).process = { env: {} };
}

(window as any).process.env = {
  API_KEY: getEnv("API_KEY"),
  SUPABASE_URL: getEnv("SUPABASE_URL"),
  SUPABASE_ANON_KEY: getEnv("SUPABASE_ANON_KEY")
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
