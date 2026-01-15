
/**
 * Polyfill process.env for the browser environment.
 * Must be imported at the very top of the entry point.
 */

const getEnvValue = (key: string): string => {
  // @ts-ignore
  const viteEnv = (import.meta as any).env;
  const windowEnv = (window as any).process?.env || {};
  
  return viteEnv?.[`VITE_${key}`] || windowEnv[key] || windowEnv[`VITE_${key}`] || "";
};

if (typeof (window as any).process === 'undefined') {
  (window as any).process = { env: {} };
}

(window as any).process.env = {
  ...((window as any).process.env || {}),
  API_KEY: getEnvValue("API_KEY"),
  SUPABASE_URL: getEnvValue("SUPABASE_URL"),
  SUPABASE_ANON_KEY: getEnvValue("SUPABASE_ANON_KEY")
};

export const IS_CONFIGURED = !!((window as any).process.env.API_KEY && (window as any).process.env.SUPABASE_URL);
