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

  function switchMode(m: "login" | "signup") {
    setMode(m);
    setMsg(null);
  }

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
        setMsg({ ok: false, text: "กรุณายอมรับนโยบายความเป็นส่วนตัวก่อนลงทะเบียน" });
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { full_name: fullName, pdpa_consent_version: PDPA_VERSION } },
      });
      if (error) setMsg({ ok: false, text: "ลงทะเบียนไม่สำเร็จ: " + error.message });
      else if (data.session) window.location.href = "/";
      else setMsg({ ok: true, text: "ลงทะเบียนสำเร็จ กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ" });
    }
    setBusy(false);
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-ink-bg p-4 dark:bg-ink-dark">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>

      <div className="w-full max-w-[400px] space-y-6">
        <div className="flex flex-col items-center text-center">
          <Logo size={72} className="mb-3 ring-1 ring-slate-200 dark:ring-slate-700" />
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">ระบบตารางเรียนและตารางสอน</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">วิทยาลัยการอาชีพโพนทอง จังหวัดร้อยเอ็ด</p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-xs font-medium dark:bg-slate-800" role="tablist">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
                className={`rounded-md py-1.5 transition ${mode === m
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}>
                {m === "login" ? "เข้าสู่ระบบ" : "ลงทะเบียนใหม่"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="label" htmlFor="fullname">ชื่อ-นามสกุล</label>
                <input id="fullname" className="input" placeholder="ระบุชื่อ-นามสกุล" value={fullName}
                  onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">อีเมล</label>
              <input id="email" type="email" className="input" placeholder="name@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="password">รหัสผ่าน</label>
              <input id="password" type="password" className="input" value={password} minLength={6}
                placeholder={mode === "signup" ? "อย่างน้อย 6 ตัวอักษร" : ""}
                onChange={(e) => setPassword(e.target.value)} required
                autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </div>
            {mode === "signup" && (
              <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  ข้าพเจ้ายินยอมให้วิทยาลัยเก็บและใช้ข้อมูลส่วนบุคคลเพื่อการจัดตารางเรียนตารางสอน ตาม{" "}
                  <Link href="/privacy" target="_blank" className="link">นโยบายความเป็นส่วนตัว</Link>
                </span>
              </label>
            )}
            {msg && (
              <p className={`rounded-lg px-3 py-2 text-xs ${msg.ok
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>{msg.text}</p>
            )}
            <button className="btn-primary w-full py-2.5" disabled={busy || (mode === "signup" && !consent)}>
              {busy ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "ลงทะเบียน"}
            </button>
          </form>
        </div>

        <div className="space-y-1.5 text-center text-xs text-slate-400">
          <p>ครูผู้สอนที่ใช้อีเมลตรงกับฐานข้อมูลครู จะได้รับสิทธิ์ครูผู้สอนโดยอัตโนมัติ</p>
          <p><Link href="/privacy" className="link">นโยบายความเป็นส่วนตัว (PDPA)</Link></p>
        </div>
      </div>
    </div>
  );
}
