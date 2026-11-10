"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Profile } from "@/lib/types";

const ROLE_LABEL = { admin: "ผู้ดูแลระบบ", teacher: "ครูผู้สอน", student: "นักเรียน" } as const;

interface NavItem { href: string; label: string; roles: Profile["role"][] }

const NAV: { section: string; items: NavItem[] }[] = [
  { section: "ทั่วไป", items: [
    { href: "/", label: "หน้าหลัก", roles: ["admin", "teacher", "student"] },
    { href: "/timetable", label: "ตารางเรียน / ตารางสอน", roles: ["admin", "teacher", "student"] },
    { href: "/availability", label: "เวลาไม่สะดวกสอน", roles: ["admin", "teacher"] },
  ] },
  { section: "ข้อมูลหลัก", items: [
    { href: "/data/semesters", label: "ภาคเรียน", roles: ["admin"] },
    { href: "/data/teachers", label: "ครูผู้สอน", roles: ["admin"] },
    { href: "/data/subjects", label: "รายวิชา", roles: ["admin"] },
    { href: "/data/rooms", label: "ห้องเรียน", roles: ["admin"] },
    { href: "/data/student_groups", label: "กลุ่มนักเรียน", roles: ["admin"] },
    { href: "/data/enrollments", label: "ภาระงานสอน", roles: ["admin"] },
    { href: "/import", label: "นำเข้าข้อมูล (CSV/Excel)", roles: ["admin"] },
  ] },
  { section: "จัดตาราง", items: [
    { href: "/generate", label: "จัดตารางอัตโนมัติ (AI)", roles: ["admin"] },
    { href: "/users", label: "จัดการผู้ใช้", roles: ["admin"] },
  ] },
];

export default function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="space-y-5">
      {NAV.map((sec) => {
        const items = sec.items.filter((i) => i.roles.includes(profile.role));
        if (!items.length) return null;
        return (
          <div key={sec.section}>
            <p className="mb-1 px-3 text-xs font-semibold uppercase text-brand-100/70">{sec.section}</p>
            {items.map((i) => {
              const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
              return (
                <Link key={i.href} href={i.href} onClick={() => setOpen(false)}
                  className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-white/15 font-semibold text-white" : "text-brand-50 hover:bg-white/10"}`}>
                  {i.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className={`no-print fixed inset-y-0 left-0 z-40 w-64 transform bg-brand-900 p-4 transition lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-6 px-3">
          <p className="text-lg font-bold text-white">ระบบจัดตารางสอน</p>
          <p className="text-xs text-brand-100">วิทยาลัยการอาชีพโพนทอง</p>
        </div>
        {nav}
      </aside>
      {open && <div className="no-print fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 min-w-0">
        <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button className="btn-secondary lg:hidden" onClick={() => setOpen(true)} aria-label="เมนู">☰</button>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <div className="text-right">
              <p className="font-medium">{profile.full_name ?? profile.email}</p>
              <p className="text-xs text-slate-500">{ROLE_LABEL[profile.role]}</p>
            </div>
            <form action="/auth/signout" method="post">
              <button className="btn-secondary">ออกจากระบบ</button>
            </form>
          </div>
        </header>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
