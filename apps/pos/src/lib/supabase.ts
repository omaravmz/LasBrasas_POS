import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const key = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

// Si no hay credenciales configuradas, el cliente es null y Realtime se deshabilita
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
