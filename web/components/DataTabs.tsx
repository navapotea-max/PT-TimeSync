"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const DATA_TABS = [
  { href: "/data/teachers", label: "ครูผู้สอน" },
  { href: "/data/subjects", label: "รายวิชา" },
  { href: "/data/rooms", label: "ห้องเรียน" },
  { href: "/data/student_groups", label: "กลุ่มนักเรียน" },
  { href: "/data/students", label: "นักเรียน" },
  { href: "/data/enrollments", label: "ภาระงานสอน" },
  { href: "/data/semesters", label: "ภาคเรียน" },
  { href: "/import", label: "นำเข้าไฟล์ CSV / Excel" },
];

/** แท็บย่อยของเมนู "ฐานข้อมูลและนำเข้าไฟล์" */
export default function DataTabs() {
  const path = usePathname();
  return (
    <div className="no-print overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-w-max gap-1">
        {DATA_TABS.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${active
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"}`}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
