"use client";

import Link from "next/link";
import { useState } from "react";
import Logo from "@/components/Logo";
import { ThemeToggle } from "@/components/Preferences";
import { PDPA_VERSION } from "@/lib/pdpa";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ ok: false, text: "เข้าสู่ระบบไม่สำเร็จ: " + error.message });
      else window.location.href = "/";
    } else {
      if (!consent) {
        setMsg({ ok: false, text: "กรุณายอมรับนโยบายความเป็นส่วนตัวก่อนสมัครสมาชิก" });
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { full_name: fullName, pdpa_consent_version: PDPA_VERSION } },
      });
      if (error) setMsg({ ok: false, text: "สมัครไม่สำเร็จ: " + error.message });
      else if (data.session) window.location.href = "/";
      else setMsg({ ok: true, text: "สมัครสำเร็จ กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ" });
    }
    setBusy(false);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-600 p-4 dark:from-slate-950 dark:to-brand-900">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <Logo size={120} className="mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-brand-900">ระบบจัดตารางเรียน-ตารางสอน</h1>
          <p className="text-slate-500">วิทยาลัยการอาชีพโพนทอง</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="label">ชื่อ-สกุล</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div>
            <label className="label">อีเมล</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">รหัสผ่าน</label>
            <input type="password" className="input" value={password} minLength={6}
              onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {mode === "signup" && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                ข้าพเจ้ายินยอมให้วิทยาลัยเก็บและใช้ข้อมูลส่วนบุคคลเพื่อการจัดตารางเรียนตารางสอน ตาม{" "}
                <Link href="/privacy" target="_blank" className="text-brand-600 underline">นโยบายความเป็นส่วนตัว</Link>
              </span>
            </label>
          )}
          {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
          <button className="btn-primary w-full" disabled={busy || (mode === "signup" && !consent)}>
            {busy ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === "login" ? "ยังไม่มีบัญชี? " : "มีบัญชีแล้ว? "}
          <button className="text-brand-600 underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "สมัครสมาชิก" : "เข้าสู่ระบบ"}
          </button>
        </p>
        <p className="mt-2 text-center text-xs text-slate-400">
          ครูที่อีเมลตรงกับข้อมูลครูในระบบจะได้สิทธิ์ &quot;ครูผู้สอน&quot; อัตโนมัติ
        </p>
        <p className="mt-2 text-center text-xs">
          <Link href="/privacy" className="text-brand-600 underline">นโยบายความเป็นส่วนตัว (PDPA)</Link>
        </p>
      </div>
    </div>
  );
}
