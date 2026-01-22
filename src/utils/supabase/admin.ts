import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Admin Client
 * 
 * WARNING: This client uses the Service Role Key which has FULL ACCESS to your database.
 * NEVER use this client on the client-side (browser).
 * Use only in secure server-side contexts (API Routes, Server Actions).
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase URL or Service Role Key");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
