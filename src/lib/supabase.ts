import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://dhrcdbybknhxjtbjpoem.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmNkYnlia25oeGp0Ympwb2VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5ODY2MzIsImV4cCI6MjA4NTU2MjYzMn0.DLZAC6YjQWji9rBBj30Rpr_dS8HHomr_NSW_EdGvRaI";

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
