import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Supabase client ฝั่งเบราว์เซอร์ (ใช้ anon key + session ของผู้ใช้ — สิทธิ์ถูกควบคุมด้วย RLS) */
export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
