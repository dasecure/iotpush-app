import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = "https://fymbvdxiksyxunyqrmzr.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5bWJ2ZHhpa3N5eHVueXFybXpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2Mzg0MTgsImV4cCI6MjA4NTIxNDQxOH0.jS7H0IYDQ8-fOA409IH1LTM6e6DjGHua15hUjVTwWEk";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
