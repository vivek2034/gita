
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * Polyfill process for the browser environment.
 * Vercel and other hosts often inject these at build time or runtime.
 */
if (typeof (window as any).process === 'undefined') {
  (window as any).process = { 
    env: {} 
  };
}

// Access environment variables
const env = (window as any).process.env;

/**
 * These variables are set in the Vercel Dashboard under Environment Variables.
 * If you are running locally without a build tool, you can manually set them here for testing,
 * but it is safer to use the host's configuration.
 */
env.API_KEY = env.API_KEY || '';
env.SUPABASE_URL = env.SUPABASE_URL || '';
env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || '';

// Verify configuration in console (helpful for debugging hosting issues)
if (!env.API_KEY) {
  console.warn("Gita Sahayak: API_KEY is missing. Check your Vercel Environment Variables.");
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

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
