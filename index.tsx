
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * Polyfill process for the browser environment.
 * We try to preserve any variables already injected by the host.
 */
if (typeof (window as any).process === 'undefined') {
  (window as any).process = { env: {} };
}

// Access the global process.env or create a fallback
const globalEnv = (window as any).process.env || {};

// We map the environment variables to a clean object.
// These are usually injected by Vercel's build system into process.env.
const env = {
  API_KEY: globalEnv.API_KEY || "",
  SUPABASE_URL: globalEnv.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: globalEnv.SUPABASE_ANON_KEY || ""
};

// Update the global process.env so other services can see it
(window as any).process.env = env;

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
