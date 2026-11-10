"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/* =====================================================================
 * โหมดสว่าง / โหมดมืด
 * ===================================================================== */
import { THEME_KEY } from "@/lib/theme";

export type ThemeChoice = "light" | "dark";

function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function savedTheme(): ThemeChoice {
  try { return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
}

/** สวิตช์เปิด/ปิด: เปิด = โหมดมืด, ปิด = โหมดสว่าง (ค่าเริ่มต้น = ปิด, ระบบจำค่าที่เลือกไว้) */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(savedTheme() === "dark");
    // พิมพ์ / PDF ใช้โหมดสว่างเสมอ
    const before = () => document.documentElement.classList.remove("dark");
    const after = () => applyTheme(savedTheme());
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  function toggle() {
    const next: ThemeChoice = dark ? "light" : "dark";
    setDark(!dark);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
    applyTheme(next);
  }

  return (
    <button type="button" role="switch" aria-checked={dark} onClick={toggle}
      aria-label="โหมดมืด" title={dark ? "ปิดโหมดมืด" : "เปิดโหมดมืด"}
      className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
        ${dark ? "border-brand-500 bg-brand-600" : "border-slate-300 bg-slate-200"}`}>
      <span className={`absolute left-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#ffffff] text-sm shadow transition-transform duration-300
        ${dark ? "translate-x-7" : "translate-x-0"}`}>
        {dark ? "🌙" : "☀️"}
      </span>
    </button>
  );
}

/* =====================================================================
 * โหมดความเป็นส่วนตัว (PDPA) — ปิดบังชื่อ/อีเมลบนหน้าจอ เหมาะกับการฉายจอ/ประชุม
 * ===================================================================== */
const PRIVACY_KEY = "pt-privacy";

interface PrivacyCtx {
  enabled: boolean;
  toggle: () => void;
  /** ปิดบังชื่อบุคคล เช่น "ครูสมชาย ใจดี" -> "ครูส***** ใ***" */
  name: (v: string | null | undefined) => string;
  /** ปิดบังอีเมล เช่น "navapotea@gmail.com" -> "n*******@gmail.com" */
  email: (v: string | null | undefined) => string;
}

const TITLES = ["ครู", "นาย", "นางสาว", "นาง", "ดร.", "อ.", "ผศ.", "รศ.", "Mr.", "Mrs.", "Ms."];

export function maskName(v: string | null | undefined): string {
  if (!v) return "";
  return v.split(/\s+/).filter(Boolean).map((word) => {
    const title = TITLES.find((t) => word.startsWith(t) && word.length > t.length);
    const rest = title ? word.slice(title.length) : word;
    const chars = Array.from(rest);
    return (title ?? "") + chars[0] + "*".repeat(Math.max(2, chars.length - 1));
  }).join(" ");
}

export function maskEmail(v: string | null | undefined): string {
  if (!v) return "";
  const [user, domain] = v.split("@");
  if (!domain) return maskName(v);
  return user.slice(0, 1) + "*".repeat(Math.max(3, user.length - 1)) + "@" + domain;
}

const Ctx = createContext<PrivacyCtx>({
  enabled: false, toggle: () => {}, name: (v) => v ?? "", email: (v) => v ?? "",
});

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    try { setEnabled(localStorage.getItem(PRIVACY_KEY) === "1"); } catch { /* ignore */ }
  }, []);
  const toggle = useCallback(() => {
    setEnabled((e) => {
      try { localStorage.setItem(PRIVACY_KEY, e ? "0" : "1"); } catch { /* ignore */ }
      return !e;
    });
  }, []);
  const name = useCallback((v: string | null | undefined) => (enabled ? maskName(v) : v ?? ""), [enabled]);
  const email = useCallback((v: string | null | undefined) => (enabled ? maskEmail(v) : v ?? ""), [enabled]);
  return <Ctx.Provider value={{ enabled, toggle, name, email }}>{children}</Ctx.Provider>;
}

export const usePrivacy = () => useContext(Ctx);

export function PrivacyToggle() {
  const { enabled, toggle } = usePrivacy();
  return (
    <button type="button" onClick={toggle} aria-pressed={enabled}
      title={enabled ? "ปิดโหมดความเป็นส่วนตัว (แสดงชื่อเต็ม)" : "เปิดโหมดความเป็นส่วนตัว (ปิดบังชื่อและอีเมล)"}
      className={`btn ${enabled ? "bg-emerald-600 text-white hover:bg-emerald-700" : "btn-secondary"}`}>
      {enabled ? "🛡️ PDPA: เปิด" : "🛡️ PDPA"}
    </button>
  );
}
