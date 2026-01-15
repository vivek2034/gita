
/**
 * Simple IndexedDB wrapper for caching Divine Audio.
 * This allows us to store megabytes of audio without crashing localStorage.
 */
const DB_NAME = 'GitaAudioCache';
const STORE_NAME = 'audios';
const DB_VERSION = 1;

export const audioCache = {
  async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
    });
  },

  async saveAudio(messageId: string, base64Data: string): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(base64Data, messageId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (e) {
      console.warn("Failed to cache audio in IndexedDB:", e);
    }
  },

  async getAudio(messageId: string): Promise<string | null> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(messageId);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    } catch (e) {
      return null;
    }
  },

  async clear(): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
  }
};
