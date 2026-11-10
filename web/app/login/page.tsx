"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
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
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { full_name: fullName } },
      });
      if (error) setMsg({ ok: false, text: "สมัครไม่สำเร็จ: " + error.message });
      else if (data.session) window.location.href = "/";
      else setMsg({ ok: true, text: "สมัครสำเร็จ กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ" });
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-600 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
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
          {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
          <button className="btn-primary w-full" disabled={busy}>
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
      </div>
    </div>
  );
}
