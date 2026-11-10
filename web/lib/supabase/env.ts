/**
 * คืนค่า Supabase Project URL ที่ถูกต้อง (https://<ref>.supabase.co)
 * แก้กรณีที่ใส่ค่าใน Environment Variables ผิดรูปแบบ เช่น
 *  - มี / ต่อท้าย, มี /rest/v1 หรือ /auth/v1 ต่อท้าย, มีช่องว่าง/เครื่องหมายคำพูด
 *  - ใส่ลิงก์หน้า dashboard: https://supabase.com/dashboard/project/<ref>/...
 */
export function supabaseUrl(): string {
  let url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/^["']|["']$/g, "");
  const dash = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1]}.supabase.co`;
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

export function supabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim().replace(/^["']|["']$/g, "");
}
