
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { HistorySession } from "../types";

/**
 * Helper to safely read environment variables.
 * In production, these are injected by the build tool.
 */
const getEnvVar = (name: string): string => {
  const env = (window as any).process?.env || {};
  return env[name] || "";
};

const supabaseUrl = getEnvVar("SUPABASE_URL");
const supabaseAnonKey = getEnvVar("SUPABASE_ANON_KEY");

let supabaseInstance: SupabaseClient | null = null;

// Only initialize if we have a valid URL and Key
if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (e) {
    console.error("Supabase initialization failed:", e);
  }
}

export const supabase = supabaseInstance;

/**
 * Returns true if the Supabase client was successfully initialized.
 */
export const isSupabaseConfigured = () => !!supabase;

export const loginWithGoogle = async () => {
  if (!supabase) {
    alert("Supabase is not configured. Did you forget to Redeploy on Vercel after adding your environment variables?");
    return;
  }
  
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      }
    });
    if (error) throw error;
    return data;
  } catch (err: any) {
    console.error("Login failed:", err);
    alert("Authentication error: " + err.message);
  }
};

export const logout = async () => {
  if (supabase) {
    await supabase.auth.signOut();
  }
  localStorage.removeItem("gita_history");
  window.location.reload();
};

export const saveHistorySession = async (userId: string, session: HistorySession) => {
  // Local storage for offline/fast UI
  const local = JSON.parse(localStorage.getItem('gita_history') || '[]');
  const filtered = local.filter((s: any) => s.id !== session.id);
  filtered.unshift(session);
  localStorage.setItem('gita_history', JSON.stringify(filtered.slice(0, 50)));

  // Cloud sync if user is authenticated
  if (supabase && userId && !userId.startsWith('guest-')) {
    try {
      const { error: sessionError } = await supabase
        .from('sessions')
        .upsert({
          id: session.id,
          user_id: userId,
          title: session.title,
          timestamp: session.timestamp
        });

      if (!sessionError) {
        await supabase.from('messages').delete().eq('session_id', session.id);
        await supabase.from('messages').insert(session.messages.map(m => ({
          id: m.id,
          session_id: session.id,
          role: m.role,
          text: m.text,
          timestamp: m.timestamp
        })));
      }
    } catch (e) {
      console.warn("Cloud sync failed (check internet connection)", e);
    }
  }
};

export const fetchHistorySessions = async (userId: string): Promise<HistorySession[]> => {
  let localData = JSON.parse(localStorage.getItem('gita_history') || '[]');

  if (supabase && userId && !userId.startsWith('guest-')) {
    try {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select(`
          id, 
          title, 
          timestamp, 
          messages (id, role, text, timestamp)
        `)
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (!error && sessions) {
        const remoteData = sessions.map((s: any) => ({
          id: s.id,
          title: s.title,
          timestamp: Number(s.timestamp),
          messages: (s.messages || []).sort((a: any, b: any) => a.timestamp - b.timestamp)
        }));
        
        const merged = [...remoteData];
        localData.forEach((ls: HistorySession) => {
          if (!merged.find(rs => rs.id === ls.id)) {
            merged.push(ls);
          }
        });
        return merged.sort((a, b) => b.timestamp - a.timestamp);
      }
    } catch (e) {
      console.error("Cloud fetch failed", e);
    }
  }
  return localData;
};

export const deleteHistorySession = async (userId: string, id: string) => {
  const local = JSON.parse(localStorage.getItem('gita_history') || '[]');
  localStorage.setItem('gita_history', JSON.stringify(local.filter((s: any) => s.id !== id)));

  if (supabase && userId && !userId.startsWith('guest-')) {
    await supabase.from('sessions').delete().eq('id', id);
  }
};
