
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { HistorySession, Message } from "../types";

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = (window as any).process?.env?.SUPABASE_URL || "";
  const supabaseAnonKey = (window as any).process?.env?.SUPABASE_ANON_KEY || "";

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

export const isSupabaseConfigured = () => !!getSupabase();

export const loginWithGoogle = async () => {
  const client = getSupabase();
  if (!client) {
    alert("Configuration missing. Please check your Supabase URL and Key.");
    return;
  }
  
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      }
    });
    if (error) throw error;
    return data;
  } catch (err: any) {
    console.error("Login failed:", err);
  }
};

export const logout = async () => {
  const client = getSupabase();
  if (client) await client.auth.signOut();
  localStorage.removeItem("gita_history");
  window.location.reload();
};

const getSafeLocalHistory = (): any[] => {
  try {
    const data = localStorage.getItem('gita_history');
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("History corrupted, resetting...", e);
    localStorage.removeItem('gita_history');
    return [];
  }
};

export const saveHistorySession = async (userId: string, session: HistorySession) => {
  // 1. Update Local Storage first for instant UI response
  try {
    const local = getSafeLocalHistory();
    const filtered = local.filter((s: any) => s.id !== session.id);
    filtered.unshift(session);
    localStorage.setItem('gita_history', JSON.stringify(filtered.slice(0, 30)));
  } catch (e) {
    console.warn("Local storage update failed", e);
  }

  // 2. Sync to Supabase if logged in
  const client = getSupabase();
  if (client && userId && !userId.startsWith('guest-')) {
    try {
      // Upsert Session
      const { error: sessionError } = await client
        .from('sessions')
        .upsert({
          id: session.id,
          user_id: userId,
          title: session.title,
          timestamp: session.timestamp
        });

      if (sessionError) {
        console.error("Session Sync Error:", sessionError.message);
        return;
      }

      // Upsert Messages
      if (session.messages && session.messages.length > 0) {
        const messagesToUpsert = session.messages.map(m => ({
          id: m.id,
          session_id: session.id,
          role: m.role,
          text: m.text,
          audio_data: m.audioData || null,
          timestamp: m.timestamp
        }));

        const { error: msgError } = await client
          .from('messages')
          .upsert(messagesToUpsert, { onConflict: 'id' });

        if (msgError) {
          // Automatic Fallback: If audio_data column is missing, retry without it
          if (msgError.message.includes('audio_data') || msgError.code === '42703') {
            console.warn("audio_data column missing in DB. Syncing text only.");
            const fallbackMessages = messagesToUpsert.map(({ audio_data, ...rest }) => rest);
            await client.from('messages').upsert(fallbackMessages, { onConflict: 'id' });
          } else {
            console.error("Message Sync Error:", msgError.message);
          }
        }
      }
    } catch (e) {
      console.error("Cloud sync exception:", e);
    }
  }
};

export const fetchHistorySessions = async (userId: string): Promise<HistorySession[]> => {
  let localData = getSafeLocalHistory();

  const client = getSupabase();
  if (client && userId && !userId.startsWith('guest-')) {
    try {
      // Use simple join syntax
      const { data: sessions, error } = await client
        .from('sessions')
        .select(`
          id, 
          title, 
          timestamp, 
          messages (*)
        `)
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      if (error) {
        console.error("Fetch sessions error:", error.message);
        return localData;
      }

      if (sessions) {
        const remoteData = sessions.map((s: any) => ({
          id: s.id,
          title: s.title,
          timestamp: Number(s.timestamp),
          messages: (s.messages || []).map((m: any) => ({
             id: m.id,
             role: m.role,
             text: m.text,
             audioData: m.audio_data,
             timestamp: Number(m.timestamp)
          })).sort((a: any, b: any) => a.timestamp - b.timestamp)
        }));
        
        // Merge strategy: Favor remote data
        const merged = [...remoteData];
        localData.forEach((ls: any) => {
          if (!merged.find(rs => rs.id === ls.id)) merged.push(ls);
        });
        return merged.sort((a, b) => b.timestamp - a.timestamp);
      }
    } catch (e) {
      console.error("Fetch history exception:", e);
    }
  }
  return localData;
};

export const deleteHistorySession = async (userId: string, id: string) => {
  try {
    const local = getSafeLocalHistory();
    localStorage.setItem('gita_history', JSON.stringify(local.filter((s: any) => s.id !== id)));
  } catch (e) {}

  const client = getSupabase();
  if (client && userId && !userId.startsWith('guest-')) {
    const { error } = await client.from('sessions').delete().eq('id', id);
    if (error) console.error("Delete error:", error.message);
  }
};
