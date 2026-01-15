
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * Static Environment Variable Mapping
 * Vite requires static access (literal strings) to replace variables during build.
 * We also check window.process.env for compatibility with some hosting environments.
 */
const getEnv = (key: 'API_KEY' | 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'): string => {
  const processEnv = (window as any).process?.env || {};
  
  if (key === 'API_KEY') {
    // @ts-ignore
    return import.meta.env?.VITE_API_KEY || processEnv.API_KEY || processEnv.VITE_API_KEY || "";
  }
  if (key === 'SUPABASE_URL') {
    // @ts-ignore
    return import.meta.env?.VITE_SUPABASE_URL || processEnv.SUPABASE_URL || processEnv.VITE_SUPABASE_URL || "";
  }
  if (key === 'SUPABASE_ANON_KEY') {
    // @ts-ignore
    return import.meta.env?.VITE_SUPABASE_ANON_KEY || processEnv.SUPABASE_ANON_KEY || processEnv.VITE_SUPABASE_ANON_KEY || "";
  }
  return "";
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
