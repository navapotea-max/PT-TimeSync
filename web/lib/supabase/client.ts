import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Supabase client ฝั่งเบราว์เซอร์ (ใช้ anon key + session ของผู้ใช้ — สิทธิ์ถูกควบคุมด้วย RLS) */
export function createClient() {
  if (!client) {
    client = createBrowserClient(
      supabaseUrl(),
      supabaseAnonKey(),
    );
  }
  return client;
}
