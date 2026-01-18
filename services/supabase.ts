
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
    alert("Configuration missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
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
  const strippedMessages = session.messages.map(({ audioData, ...rest }) => rest);
  const sessionToStore = { ...session, messages: strippedMessages };

  // 1. Update Local Storage for instant UI feedback
  try {
    const local = getSafeLocalHistory();
    const filtered = local.filter((s: any) => s.id !== session.id);
    filtered.unshift(sessionToStore);
    localStorage.setItem('gita_history', JSON.stringify(filtered.slice(0, 30)));
  } catch (e) {
    localStorage.setItem('gita_history', JSON.stringify([sessionToStore]));
  }

  // 2. Sync to Supabase
  const client = getSupabase();
  if (client && userId && !userId.startsWith('guest-')) {
    try {
      // Step A: Persist Session Metadata
      const { error: sessionError } = await client
        .from('sessions')
        .upsert({
          id: session.id,
          user_id: userId,
          title: session.title,
          timestamp: session.timestamp
        });

      if (sessionError) {
        console.error("Supabase Session Sync Error:", sessionError.message);
        return;
      }

      // Step B: Persist Messages
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
          console.error("Supabase Message Sync Error:", msgError.message);
        } else {
          console.debug(`Successfully synced ${messagesToUpsert.length} messages.`);
        }
      }
    } catch (e) {
      console.warn("Cloud sync exception:", e);
    }
  }
};

export const fetchHistorySessions = async (userId: string): Promise<HistorySession[]> => {
  let localData = getSafeLocalHistory();

  const client = getSupabase();
  if (client && userId && !userId.startsWith('guest-')) {
    try {
      // Explicitly request the relationship to ensure Supabase resolves the join
      const { data: sessions, error } = await client
        .from('sessions')
        .select('id, title, timestamp, messages!messages_session_id_fkey(id, role, text, audio_data, timestamp)')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false });

      // Fallback if the specific FK naming is different in their DB
      if (error) {
        console.debug("FK specific join failed, trying generic join...");
        const { data: retryData, error: retryError } = await client
          .from('sessions')
          .select('id, title, timestamp, messages(id, role, text, audio_data, timestamp)')
          .eq('user_id', userId)
          .order('timestamp', { ascending: false });
        
        if (retryError) {
          console.error("Supabase Fetch Final Error:", retryError.message);
          return localData;
        }
        return processSessions(retryData, localData);
      }

      return processSessions(sessions, localData);
    } catch (e) {
      console.error("Supabase connection failed:", e);
    }
  }
  return localData;
};

const processSessions = (sessions: any[], localData: any[]): HistorySession[] => {
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
  localData.forEach((ls: any) => {
    if (!merged.find(rs => rs.id === ls.id)) merged.push(ls);
  });
  return merged.sort((a, b) => b.timestamp - a.timestamp);
};

export const deleteHistorySession = async (userId: string, id: string) => {
  try {
    const local = getSafeLocalHistory();
    localStorage.setItem('gita_history', JSON.stringify(local.filter((s: any) => s.id !== id)));
  } catch (e) {}

  const client = getSupabase();
  if (client && userId && !userId.startsWith('guest-')) {
    const { error } = await client.from('sessions').delete().eq('id', id);
    if (error) console.error("Supabase Delete Error:", error.message);
  }
};
