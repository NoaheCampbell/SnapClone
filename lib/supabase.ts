import { createClient } from "@supabase/supabase-js";
import 'react-native-url-polyfill/auto';

// Ensure the required environment variables are available.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment."
  );
}

// Create a single Supabase client for the whole app.
export const supabase = createClient(supabaseUrl, supabaseAnonKey); 