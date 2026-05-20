import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables");
}

// Reverting to Anon Key for security and browser compatibility.
// Data access will be managed via Authentication and RLS policies.
export const supabase = createClient(
  supabaseUrl || "", 
  supabaseAnonKey || ""
);
