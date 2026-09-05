import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseAdmin(): {
  client: SupabaseClient | null;
  missing: string[];
} {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!url) missing.push("VITE_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("VITE_SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    return { client: null, missing };
  }

  return {
    client: createClient(url!, serviceRoleKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    missing: [],
  };
}
