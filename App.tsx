
import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { Message, AppState, HistorySession } from './types';
import { SUGGESTED_TOPICS, LANGUAGES } from './constants';
import { 
  getSupabase, loginWithGoogle, logout, 
  saveHistorySession, fetchHistorySessions, deleteHistorySession,
  isSupabaseConfigured
} from './services/supabase';
import { gitaService } from './services/geminiService';
import { audioCache } from './services/audioCache';
import { IS_CONFIGURED } from './services/env';
import { 
  Send, ScrollText, Menu, Loader2, History, 
  PlusCircle, Globe, LogOut, Sparkles, Share2, 
  Mic, LogIn, User, Play, Pause, X, Trash2, MicOff,
  AlertCircle, ExternalLink, Settings, ShieldCheck, ShieldAlert,
  Volume2, Compass, CheckCircle2, Check
} from 'lucide-react';

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [user, setUser] = useState<any | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<AppState>(AppState.IDLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [language, setLanguage] = useState('en');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [cachedAudioIds, setCachedAudioIds] = useState<Set<string>>(new Set());
  const [sharedId, setSharedId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const isRedirect = window.location.hash.includes('access_token');
    if (isRedirect) setIsAuthLoading(true);

    const timer = setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      if (splash) splash.classList.add('hidden');
      setTimeout(() => setShowSplash(false), 1000);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const client = getSupabase();
      if (!client) {
        await handleGuestMode();
        setIsAuthLoading(false);
        return;
      }

      try {
        const { data: { session: initialSession } } = await client.auth.getSession();
        
        if (initialSession?.user) {
          await handleUserUpdate(initialSession.user);
          if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
        } else if (!window.location.hash.includes('access_token')) {
          await handleGuestMode();
        }

        const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
          if (session?.user) {
            await handleUserUpdate(session.user);
            if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
          } else if (event === 'SIGNED_OUT') {
            await handleGuestMode();
          }
          setIsAuthLoading(false);
        });

        const timeout = setTimeout(() => setIsAuthLoading(false), 5000);

        return () => {
          subscription.unsubscribe();
          clearTimeout(timeout);
        };
      } catch (e) {
        await handleGuestMode();
        setIsAuthLoading(false);
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    const checkCache = async () => {
      try {
        const newCachedIds = new Set<string>();
        for (const m of messages) {
          if (m.role === 'model') {
            const has = await audioCache.getAudio(m.id);
            if (has) newCachedIds.add(m.id);
          }
        }
        setCachedAudioIds(newCachedIds);
      } catch (e) {}
    };
    checkCache();
  }, [messages]);

  const handleUserUpdate = async (sbUser: any) => {
    try {
      const profile = {
        uid: sbUser.id,
        displayName: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || "Devotee",
        photoURL: sbUser.user_metadata?.avatar_url
      };
      setUser(profile);
      const sessions = await fetchHistorySessions(profile.uid);
      setHistorySessions(sessions);
      if (messages.length === 0) initWelcome(profile.displayName);
    } catch (e) {
      handleGuestMode();
    }
  };

  const handleGuestMode = async () => {
    setUser(null);
    const gid = "guest-user";
    try {
      const sessions = await fetchHistorySessions(gid);
      setHistorySessions(sessions);
      if (messages.length === 0) initWelcome();
    } catch (e) {}
  };

  const initWelcome = (name?: string) => {
    const txt = `Namaste, ${name || 'dear devotee'}. I am Krishna. I am here to guide you through the wisdom of the Bhagavad Gita. What troubles your heart today?`;
    setMessages([{ id: 'init', role: 'model', text: txt, timestamp: Date.now() }]);
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech recognition not supported.");
        return;
      }
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.onresult = (e: any) => { setInput(e.results[0][0].transcript); setIsListening(false); };
      recognitionRef.current.onend = () => setIsListening(false);
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const stopAudio = () => {
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch(e) {}
      currentSourceRef.current = null;
    }
    setIsSpeaking(null);
  };

  const playAudioFromBase64 = async (base64: string, msgId: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      
      const dataInt16 = new Int16Array(bytes.buffer);
      const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setIsSpeaking(null);
      currentSourceRef.current = source;
      source.start();
      setIsSpeaking(msgId);
    } catch (e) {
      setIsSpeaking(null);
    }
  };

  const handleSpeak = async (msg: Message) => {
    if (isSpeaking === msg.id) {
      stopAudio();
      return;
    }
    stopAudio();

    const cached = await audioCache.getAudio(msg.id);
    if (cached) {
      await playAudioFromBase64(cached, msg.id);
      return;
    }

    setIsSpeaking(msg.id);
    setIsAudioLoading(true);

    try {
      const cleanedText = msg.text.replace(/\[SHLOKA\]|\[\/SHLOKA\]/g, "");
      const base64 = await gitaService.generateSpeech(cleanedText);
      if (!base64) throw new Error("Divine voice interrupted");
      
      await audioCache.saveAudio(msg.id, base64);
      setCachedAudioIds(prev => new Set([...prev, msg.id]));
      await playAudioFromBase64(base64, msg.id);
    } catch (e: any) {
      setErrorMessage(e.message);
      setIsSpeaking(null);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const handleShare = async (msg: Message) => {
    const cleanedText = msg.text.replace(/\[SHLOKA\]|\[\/SHLOKA\]/g, "").trim();
    const shareContent = `${cleanedText}\n\n— Wisdom via Gita Sahayak\nRadhe Radhe`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Wisdom from Bhagavad Gita',
          text: shareContent,
          url: window.location.origin,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error("Share failed:", err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareContent);
        setSharedId(msg.id);
        setTimeout(() => setSharedId(null), 2000);
      } catch (err) {
        console.error("Clipboard copy failed:", err);
      }
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Delete this journey?")) return;
    const uid = user?.uid || "guest-user";
    await deleteHistorySession(uid, id);
    setHistorySessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) { setActiveSessionId(null); initWelcome(user?.displayName); }
  };

  const handleClearCurrentChat = () => {
    if (messages.length <= 1) return;
    if (!window.confirm("Clear the current conversation?")) return;
    setActiveSessionId(null);
    initWelcome(user?.displayName);
  };

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isGenerating) return;

    setIsGenerating(true);
    setErrorMessage(null);
    setInput('');
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text.trim(), timestamp: Date.now() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setStatus(AppState.THINKING);

    try {
      const history = updated.slice(-6).map(m => ({ 
        role: m.role as 'user' | 'model', 
        parts: [{ text: m.text }] 
      }));

      const botMsgId = (Date.now() + 1).toString();
      let botText = "";
      setMessages(prev => [...prev, { id: botMsgId, role: 'model', text: "", timestamp: Date.now() }]);

      const stream = gitaService.getGuidanceStream(text.trim(), language, history);
      for await (const chunk of stream) {
        botText += chunk;
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: botText } : m));
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }

      setStatus(AppState.IDLE);
      const finalMessages: Message[] = [...updated, { id: botMsgId, role: 'model', text: botText, timestamp: Date.now() }];
      const uid = user?.uid || "guest-user";
      const sid = activeSessionId || Math.random().toString(36).substr(2, 9);
      const session: HistorySession = {
        id: sid,
        title: text.trim().substring(0, 30) + "...",
        messages: finalMessages,
        timestamp: Date.now()
      };
      await saveHistorySession(uid, session);
      setActiveSessionId(sid);
      const freshSessions = await fetchHistorySessions(uid);
      setHistorySessions(freshSessions);
    } catch (e: any) {
      setErrorMessage(e.message || "Divine connection failed.");
      setStatus(AppState.ERROR);
    } finally {
      setIsGenerating(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const renderText = (text: string) => {
    try {
      const parts = text.split(/\[SHLOKA\]|\[\/SHLOKA\]/);
      return parts.map((p, i) => {
        if (i % 2 === 1) {
          return (
            <div key={i} className="my-3 md:my-6 p-4 md:p-8 border-l-4 border-amber-900 bg-white/40 rounded-r-2xl text-center shadow-inner relative overflow-hidden">
               <div className="absolute top-0 right-0 p-2 opacity-10"><img src="https://github.com/vivek2034/images/blob/main/Vibrant%20peacock%20feather%20details.png?raw=true" className="w-6 h-6 md:w-8 md:h-8" /></div>
               <p className="font-devanagari text-base md:text-2xl text-amber-900 leading-relaxed font-bold">{p.trim()}</p>
            </div>
          );
        }
        return <div key={i} className="prose prose-sm max-w-none text-amber-950 font-medium mb-3 md:mb-4 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: marked.parse(p) }} />;
      });
    } catch (e) {
      return <p className="text-amber-950 font-medium">{text}</p>;
    }
  };

  if (isAuthLoading && !showSplash) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] parchment-bg p-8 text-center font-inter">
        <div className="parchment-overlay" />
        <Compass className="w-12 h-12 md:w-16 md:h-16 text-amber-900 mb-6 animate-spin-slow" />
        <h2 className="text-xl md:text-2xl font-cinzel font-bold text-amber-900 mb-2">Sacred Entry</h2>
        <p className="text-amber-950/60 uppercase text-[9px] md:text-[10px] font-black tracking-[0.3em]">Preparing your journey...</p>
        <button onClick={() => setIsAuthLoading(false)} className="mt-8 text-[9px] text-amber-900/40 uppercase font-black hover:text-amber-900 underline underline-offset-4">Skip to Guest Mode</button>
      </div>
    );
  }

  if (!IS_CONFIGURED && !showSplash) {
    return (
      <div className="flex items-center justify-center h-[100dvh] parchment-bg p-6 md:p-8 text-center font-inter">
        <div className="parchment-overlay" />
        <div className="max-w-md bg-white/60 backdrop-blur-xl p-8 md:p-12 rounded-[1.5rem] md:rounded-[2.5rem] border border-amber-900/20 shadow-2xl z-20">
          <Settings className="w-12 h-12 md:w-16 md:h-16 text-amber-900 mx-auto mb-6 animate-spin-slow" />
          <h2 className="text-xl md:text-2xl font-cinzel font-bold text-amber-900 mb-4">Divine Configuration</h2>
          <p className="text-sm text-amber-950/70 mb-8 leading-relaxed">To start, add <strong>VITE_API_KEY</strong> and <strong>VITE_SUPABASE_URL</strong> to your Environment Variables.</p>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" className="block w-full bg-amber-900 text-amber-50 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-amber-800 transition-all">Get Gemini Key</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] parchment-bg overflow-hidden font-inter text-sm md:text-base">
      <div className="parchment-overlay" />
      <div className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)} />
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#f4e4bc]/98 border-r border-amber-900/20 transform transition-transform lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full shadow-2xl'}`}>
        <div className="flex flex-col h-full p-6">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <ScrollText className="w-6 h-6 text-amber-900" />
              <h1 className="text-xl font-cinzel font-bold text-amber-900">Gita Sahayak</h1>
            </div>
            <button className="lg:hidden text-amber-900" onClick={() => setIsSidebarOpen(false)}><X className="w-6 h-6" /></button>
          </div>
          <button onClick={() => { setActiveSessionId(null); initWelcome(user?.displayName); setIsSidebarOpen(false); }} className="flex items-center gap-2 w-full p-4 mb-8 bg-amber-900/10 hover:bg-amber-900/20 rounded-2xl text-amber-900 font-bold transition-all border border-amber-900/10 shadow-sm">
            <PlusCircle className="w-4 h-4" /> New Journey
          </button>
          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
            <p className="text-[10px] text-amber-900/30 uppercase tracking-[0.2em] mb-4 font-black">History</p>
            {historySessions.map(s => (
              <div key={s.id} className="group relative">
                <button onClick={() => { setMessages(s.messages); setActiveSessionId(s.id); setIsSidebarOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-xl text-left text-xs truncate transition-all ${activeSessionId === s.id ? 'bg-amber-900/20 text-amber-900 border border-amber-900/10 shadow-sm' : 'text-amber-900/60 hover:bg-amber-900/5'}`}>
                  <History className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate pr-8">{s.title}</span>
                </button>
                <button onClick={(e) => handleDeleteSession(e, s.id)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 lg:opacity-0 lg:group-hover:opacity-100 opacity-100 hover:text-red-600 transition-all text-amber-900/40"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div className="mt-auto pt-4 border-t border-amber-900/10">
            {user ? (
              <div className="flex items-center gap-3 p-3 bg-white/20 rounded-2xl border border-amber-900/5">
                <div className="w-8 h-8 rounded-full bg-amber-900 flex items-center justify-center shrink-0 border border-white/50 overflow-hidden">
                  {user.photoURL ? <img src={user.photoURL} className="w-full h-full" referrerPolicy="no-referrer" /> : <User className="w-4 h-4 text-amber-100" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-950 truncate">{user.displayName}</p>
                  <button onClick={logout} className="flex items-center gap-1 text-[10px] text-amber-900/50 hover:text-red-600 transition-colors uppercase font-black tracking-widest mt-0.5"><LogOut className="w-2.5 h-2.5" /> Sign Out</button>
                </div>
              </div>
            ) : (
              <button onClick={loginWithGoogle} className="w-full flex items-center justify-center gap-2 bg-amber-900 text-amber-50 py-4 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-amber-800 transition-all shadow-lg active:scale-95"><LogIn className="w-4 h-4" /> Sign In</button>
            )}
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col relative min-w-0">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 z-20 border-b border-amber-900/5 backdrop-blur-sm bg-white/10 shrink-0">
          <button className="lg:hidden text-amber-900 p-2" onClick={() => setIsSidebarOpen(true)} aria-label="Menu"><Menu className="w-6 h-6" /></button>
          <div className="flex items-center gap-2 md:gap-3 bg-amber-900/5 px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-amber-900/10">
            <Globe className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-900/60" />
            <select value={language} onChange={e => setLanguage(e.target.value)} className="bg-transparent text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-amber-900/60 focus:outline-none cursor-pointer">
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
          <button onClick={handleClearCurrentChat} className={`p-2 transition-colors ${messages.length > 1 ? 'text-amber-900/60 hover:text-red-600' : 'text-amber-900/10'}`} disabled={messages.length <= 1} aria-label="Clear chat"><Trash2 className="w-5 h-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-8 scroll-smooth">
          <div className="max-w-3xl mx-auto space-y-8 md:space-y-12 pb-32 md:pb-40">
            {messages.length === 1 && (
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mt-8 md:mt-12">
                 {SUGGESTED_TOPICS.map(t => (
                   <button key={t} onClick={() => handleSend(t)} className="p-4 md:p-6 text-left bg-white/40 hover:bg-amber-900/5 border border-amber-900/10 rounded-2xl md:rounded-3xl transition-all shadow-sm hover:shadow-md active:scale-[0.98]">
                     <img src="https://github.com/vivek2034/images/blob/main/Vibrant%20peacock%20feather%20details.png?raw=true" className="w-4 h-4 md:w-5 md:h-5 text-amber-700 mb-2 md:mb-3" />
                     <p className="text-[13px] md:text-sm font-bold text-amber-900 leading-snug">{t}</p>
                   </button>
                 ))}
               </div>
            )}
            {messages.map((m, idx) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                <div className={`max-w-[95%] sm:max-w-[90%] group ${m.role === 'user' ? 'bg-amber-900/10 p-4 md:p-5 rounded-2xl md:rounded-3xl rounded-tr-none border border-amber-900/10' : 'w-full message-model p-4 md:p-8 shadow-sm'}`}>
                  {m.role === 'model' ? (
                    <div className="flex gap-4 md:gap-6">
                      <div className="hidden sm:flex w-10 h-10 rounded-2xl bg-amber-900 items-center justify-center shrink-0 mt-1 shadow-lg"><ScrollText className="w-5 h-5 text-amber-100" /></div>
                      <div className="flex-1 min-w-0">
                        {renderText(m.text)}
                        {idx > 0 && (
                          <div className="flex items-center gap-4 md:gap-6 mt-6 md:mt-8 border-t border-amber-900/10 pt-4 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex-wrap">
                            <button onClick={() => handleSpeak(m)} className="flex items-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-amber-900/40 hover:text-amber-700">
                              {isAudioLoading && isSpeaking === m.id ? <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" /> : (isSpeaking === m.id ? <Pause className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Play className="w-3.5 h-3.5 md:w-4 md:h-4" />)} 
                              {cachedAudioIds.has(m.id) ? "Listen Again" : "Listen Voice"}
                            </button>
                            {cachedAudioIds.has(m.id) && <div className="flex items-center gap-1 text-[8px] font-black text-green-600/60 uppercase tracking-tighter"><CheckCircle2 className="w-2.5 h-2.5" /> Cached</div>}
                            
                            <button 
                              onClick={() => handleShare(m)} 
                              className={`flex items-center gap-2 text-[9px] md:text-[10px] font-black uppercase tracking-widest ml-auto transition-all ${sharedId === m.id ? 'text-green-600' : 'text-amber-900/40 hover:text-amber-700'}`}
                            >
                              {sharedId === m.id ? <Check className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Share2 className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                              {sharedId === m.id ? "Copied!" : "Share"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : <p className="text-sm md:text-[15px] text-amber-950 font-medium">{m.text}</p>}
                </div>
              </div>
            ))}
            {status === AppState.THINKING && (
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-amber-900/10 flex items-center justify-center shrink-0"><Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin text-amber-700" /></div>
                <div className="space-y-2 md:space-y-3 pt-2 md:pt-3">
                  <div className="h-2.5 md:h-3 bg-amber-900/5 rounded-full w-40 md:w-48 animate-pulse" />
                  <div className="h-2.5 md:h-3 bg-amber-900/5 rounded-full w-24 md:w-32 animate-pulse" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 bg-gradient-to-t from-[#fcf5e5] via-[#fcf5e5]/95 to-transparent z-20">
          <div className="max-w-3xl mx-auto">
             <div className="flex items-center gap-2 md:gap-3 bg-white/70 backdrop-blur-md border border-amber-900/10 rounded-2xl md:rounded-[2rem] p-2 md:p-3 shadow-2xl focus-within:border-amber-900/30 transition-all">
               <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Ask Krishna..." className="flex-1 bg-transparent border-none outline-none px-3 md:px-4 py-2 md:py-3 text-sm md:text-[15px] text-amber-950 placeholder-amber-900/30 font-medium" />
               <button onClick={toggleListening} className={`p-3 md:p-4 rounded-xl md:rounded-2xl transition-all active:scale-95 ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-amber-900/10 text-amber-900 hover:bg-amber-900/20'}`} aria-label="Voice input">
                 {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
               </button>
               <button onClick={() => handleSend()} disabled={!input.trim() || isGenerating} className="p-3 md:p-4 bg-amber-900 disabled:bg-slate-300 text-amber-50 rounded-xl md:rounded-2xl hover:bg-amber-800 shadow-xl transition-all active:scale-95" aria-label="Send">
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
               </button>
             </div>
             {errorMessage && (
               <div className="mt-3 md:mt-4 p-2 md:p-3 bg-red-50 border border-red-100 rounded-xl text-center">
                 <p className="text-[9px] md:text-[10px] text-red-600 font-bold uppercase tracking-widest">{errorMessage}</p>
                 <button onClick={() => handleSend()} className="mt-1.5 text-[8px] md:text-[9px] text-red-600 underline font-black uppercase tracking-widest">Try Again</button>
               </div>
             )}
             <p className="text-center mt-4 md:mt-5 text-[8px] md:text-[10px] text-amber-900/40 font-black uppercase tracking-[0.2em] md:tracking-[0.4em]">Wisdom from the Eternal Bhagavad Gita</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
