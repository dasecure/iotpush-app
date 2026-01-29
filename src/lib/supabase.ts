import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://fymbvdxiksyxunyqrmzr.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5bWJ2ZHhpa3N5eHVueXFybXpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2Mzg0MTgsImV4cCI6MjA4NTIxNDQxOH0.jS7H0IYDQ8-fOA409IH1LTM6e6DjGHua15hUjVTwWEk";

let AsyncStorage: any = null;
try {
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch (e) {
  console.log("AsyncStorage not available, using memory storage");
}

// In-memory fallback
const memoryStore: Record<string, string> = {};

const storage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (AsyncStorage) return await AsyncStorage.getItem(key);
    } catch (e) { /* fall through */ }
    return memoryStore[key] || null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (AsyncStorage) { await AsyncStorage.setItem(key, value); return; }
    } catch (e) { /* fall through */ }
    memoryStore[key] = value;
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (AsyncStorage) { await AsyncStorage.removeItem(key); return; }
    } catch (e) { /* fall through */ }
    delete memoryStore[key];
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
