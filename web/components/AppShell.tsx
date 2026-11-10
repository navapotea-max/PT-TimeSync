"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ConsentDialog from "@/components/ConsentDialog";
import { DATA_TABS } from "@/components/DataTabs";
import {
  IconIdCard, IconUserCircle,
  IconClock, IconDashboard, IconDatabase, IconDownload, IconLogout, IconMenu, IconPlay, IconShield, IconTable, IconUsers,
} from "@/components/Icons";
import Logo from "@/components/Logo";
import { PrivacyToggle, ThemeToggle, usePrivacy } from "@/components/Preferences";
import { useProfile, useViewAs } from "@/components/ProfileProvider";
import { ViewAsBanner, ViewAsSwitcher } from "@/components/ViewAsSwitcher";
import { PDPA_VERSION } from "@/lib/pdpa";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const ROLE_LABEL = { admin: "ผู้ดูแลระบบ", teacher: "ครูผู้สอน", student: "นักเรียน" } as const;
type Role = Profile["role"];

interface NavItem { href: string; label: string; roles: Role[]; icon: React.ComponentType<{ className?: string }>; match?: string[] }

const NAV: { section: string; items: NavItem[] }[] = [
  { section: "ตารางเรียนและการสอน", items: [
    { href: "/", label: "ภาพรวมระบบ", roles: ["admin", "teacher", "student"], icon: IconDashboard },
    { href: "/timetable", label: "ตารางเรียน / ตารางสอน", roles: ["admin", "teacher", "student"], icon: IconTable },
    { href: "/availability", label: "เวลาที่ไม่สะดวกสอน", roles: ["admin", "teacher"], icon: IconClock },
  ] },
  { section: "บุคลากรและนักเรียน", items: [
    { href: "/profile", label: "โปรไฟล์ของฉัน", roles: ["admin", "teacher", "student"], icon: IconUserCircle },
    { href: "/directory", label: "รายชื่อครูและนักเรียน", roles: ["admin", "teacher"], icon: IconIdCard, match: ["/directory", "/people"] },
  ] },
  { section: "การจัดการและจัดตาราง", items: [
    { href: "/data/teachers", label: "ฐานข้อมูลและนำเข้าไฟล์", roles: ["admin"], icon: IconDatabase, match: ["/data", "/import"] },
    { href: "/generate", label: "ประมวลผลจัดตารางสอน", roles: ["admin"], icon: IconPlay },
  ] },
  { section: "ผู้ใช้งานและความปลอดภัย", items: [
    { href: "/users", label: "ผู้ใช้งานและสิทธิ์", roles: ["admin"], icon: IconUsers },
    { href: "/backup", label: "สำรองและกู้คืนข้อมูล", roles: ["admin"], icon: IconDownload },
    { href: "/pdpa", label: "ข้อมูลส่วนบุคคล (PDPA)", roles: ["admin", "teacher", "student"], icon: IconShield },
  ] },
];

export default function AppShell({ children }: { profile?: Profile; children: React.ReactNode }) {
  const profile = useProfile();          // มุมมองที่กำลังแสดง
  const { real, simulating, view } = useViewAs();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const privacy = usePrivacy();
  // ต้องยินยอมใหม่เมื่อนโยบายเปลี่ยนเวอร์ชัน
  const [consented, setConsented] = useState(Boolean(real.pdpa_consent_at) && real.pdpa_consent_version === PDPA_VERSION);
  const [semesterName, setSemesterName] = useState<string | null>(null);

  useEffect(() => {
    createClient().from("semesters").select("name").eq("is_active", true).maybeSingle()
      .then(({ data }) => setSemesterName(data?.name ?? null));
  }, []);

  const isActive = (i: NavItem) =>
    i.match ? i.match.some((m) => path.startsWith(m)) : i.href === "/" ? path === "/" : path.startsWith(i.href);

  return (
    <div className="min-h-screen lg:flex">
      {/* ---------- Sidebar ---------- */}
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200/80 bg-white px-4 py-5 transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <Link href="/" className="mb-7 flex items-center gap-3 px-2" onClick={() => setOpen(false)}>
          <Logo size={40} className="ring-1 ring-slate-200 dark:ring-slate-700" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">PT-TimeSync</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">วิทยาลัยการอาชีพโพนทอง</p>
          </div>
        </Link>

        <nav className="flex-1 space-y-6 overflow-y-auto">
          {NAV.map((sec) => {
            const items = sec.items.filter((i) => i.roles.includes(profile.role));
            if (!items.length) return null;
            return (
              <div key={sec.section}>
                <p className="mb-2 px-3 text-[11px] font-semibold text-slate-400 dark:text-slate-500">{sec.section}</p>
                <div className="space-y-0.5">
                  {items.map((i) => {
                    const active = isActive(i);
                    const Icon = i.icon;
                    return (
                      <div key={i.href}>
                        <Link href={i.href} onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active
                            ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"}`}>
                          <Icon className={`h-4 w-4 shrink-0 ${active ? "" : "text-slate-400 dark:text-slate-500"}`} />
                          <span className="truncate">{i.label}</span>
                        </Link>
                        {i.href === "/data/teachers" && active && (
                          <div className="ml-6 mt-1 space-y-0.5 border-l border-slate-100 pl-3 dark:border-slate-800">
                            {DATA_TABS.map((t) => {
                              const subActive = path.startsWith(t.href);
                              return (
                                <Link key={t.href} href={t.href} onClick={() => setOpen(false)}
                                  className={`block rounded-md px-2.5 py-1.5 text-xs transition ${subActive
                                    ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
                                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}>
                                  {t.label}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-slate-100 px-2 pt-4 dark:border-slate-800">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>ภาคเรียนปัจจุบัน</span>
            <span className="font-mono font-semibold text-brand-600 dark:text-brand-400">{semesterName ?? "–"}</span>
          </div>
        </div>
      </aside>
      {open && <div className="no-print fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-[1px] lg:hidden" onClick={() => setOpen(false)} />}

      {/* ---------- Main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 lg:px-8">
          <div className="flex items-center gap-2.5 lg:hidden">
            <button type="button" onClick={() => setOpen(true)} aria-label="เปิดเมนู"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <IconMenu />
            </button>
            <span className="text-sm font-bold text-slate-900 dark:text-white">PT-TimeSync</span>
          </div>

          <ViewAsSwitcher />

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5 text-sm">
            <PrivacyToggle />
            <ThemeToggle />
            <div className="hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
            <Link href="/profile" title="โปรไฟล์ของฉัน" className="hidden text-right leading-tight hover:opacity-80 sm:block">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {privacy.name(real.full_name) || privacy.email(real.email)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {ROLE_LABEL[real.role]}{simulating && <span className="text-amber-600 dark:text-amber-400"> · ดูแบบ{ROLE_LABEL[profile.role]}</span>}
              </p>
            </Link>
            <form action="/auth/signout" method="post">
              <button className="btn-secondary btn-sm" title="ออกจากระบบ">
                <IconLogout className="h-3.5 w-3.5" /><span className="hidden sm:inline">ออกจากระบบ</span>
              </button>
            </form>
          </div>
        </header>

        <ViewAsBanner />
        {privacy.enabled && (
          <div className="no-print border-b border-brand-200 bg-brand-50 px-4 py-1.5 text-center text-xs font-medium text-brand-800 dark:border-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
            โหมดซ่อนข้อมูลส่วนบุคคล (PDPA) เปิดใช้งานอยู่ — ชื่อและอีเมลถูกอำพรางสำหรับแสดงผลหน้าจอ
          </div>
        )}

        {/* key: เมื่อสลับมุมมอง ให้หน้าโหลดใหม่ตามบทบาทที่เลือก */}
        <main key={`${view.role}|${view.teacherId}|${view.groupId}|${view.studentId ?? ""}`} className="mx-auto w-full max-w-[1400px] flex-1 p-4 lg:p-8">{children}</main>
        {!consented && <ConsentDialog onDone={() => setConsented(true)} />}
      </div>
    </div>
  );
}
