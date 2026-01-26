// js/supabaseClient.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://ptesvliuwdxlgnvkpkjn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Y6jNR0CNdACkyNq5kyQOqw_vRakxgNx";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
