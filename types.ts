
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  audioData?: string; // Base64 PCM data
  translation?: {
    text: string;
    langCode: string;
  };
}

export interface VerseReference {
  chapter: number;
  verse: number;
  sanskrit: string;
  english: string;
}

export interface Favorite {
  id: string;
  title: string;
  text: string;
  timestamp: number;
}

export interface HistorySession {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

export enum AppState {
  IDLE = 'IDLE',
  THINKING = 'THINKING',
  ERROR = 'ERROR'
}

export type View = 'chat' | 'history' | 'favorites';
