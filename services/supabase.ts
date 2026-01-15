
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { HistorySession } from "../types";

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || (window as any).process?.env?.SUPABASE_URL || "";
  const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (window as any).process?.env?.SUPABASE_ANON_KEY || "";

  if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
    try {
      supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      return supabaseInstance;
    } catch (e) {
      console.error("Supabase initialization failed:", e);
    }
  }
  return null;
};

// Export a proxy or helper to check configuration
export const isSupabaseConfigured = () => !!getSupabase();

export const loginWithGoogle = async () => {
  const client = getSupabase();
  if (!client) {
    alert("Supabase is not configured. Please ensure your VITE_... keys are set in Vercel and Redeploy.");
    return;
  }
  
  try {
    const { data, error } = await client.auth.signInWithOAuth({
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
  const client = getSupabase();
  if (client) {
    await client.auth.signOut();
  }
  localStorage.removeItem("gita_history");
  window.location.reload();
};

export const saveHistorySession = async (userId: string, session: HistorySession) => {
  const local = JSON.parse(localStorage.getItem('gita_history') || '[]');
  const filtered = local.filter((s: any) => s.id !== session.id);
  filtered.unshift(session);
  localStorage.setItem('gita_history', JSON.stringify(filtered.slice(0, 50)));

  const client = getSupabase();
  if (client && userId && !userId.startsWith('guest-')) {
    try {
      const { error: sessionError } = await client
        .from('sessions')
        .upsert({
          id: session.id,
          user_id: userId,
          title: session.title,
          timestamp: session.timestamp
        });

      if (!sessionError) {
        await client.from('messages').delete().eq('session_id', session.id);
        await client.from('messages').insert(session.messages.map(m => ({
          id: m.id,
          session_id: session.id,
          role: m.role,
          text: m.text,
          audio_data: m.audioData || null,
          timestamp: m.timestamp
        })));
      }
    } catch (e) {
      console.warn("Cloud sync failed", e);
    }
  }
};

export const fetchHistorySessions = async (userId: string): Promise<HistorySession[]> => {
  let localData = JSON.parse(localStorage.getItem('gita_history') || '[]');

  const client = getSupabase();
  if (client && userId && !userId.startsWith('guest-')) {
    try {
      const { data: sessions, error } = await client
        .from('sessions')
        .select(`
          id, 
          title, 
          timestamp, 
          messages (id, role, text, audio_data, timestamp)
        `)
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (!error && sessions) {
        const remoteData = sessions.map((s: any) => ({
          id: s.id,
          title: s.title,
          timestamp: Number(s.timestamp),
          messages: (s.messages || []).map((m: any) => ({
             id: m.id,
             role: m.role,
             text: m.text,
             audioData: m.audio_data,
             timestamp: m.timestamp
          })).sort((a: any, b: any) => a.timestamp - b.timestamp)
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

  const client = getSupabase();
  if (client && userId && !userId.startsWith('guest-')) {
    await client.from('sessions').delete().eq('id', id);
  }
};
