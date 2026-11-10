"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePrivacy } from "@/components/Preferences";
import { useProfile } from "@/components/ProfileProvider";
import { createClient } from "@/lib/supabase/client";
import type { ScheduleJob, Semester } from "@/lib/types";

const STATS = [
  { table: "teachers", label: "ครูผู้สอน", unit: "คน", href: "/data/teachers" },
  { table: "subjects", label: "รายวิชา", unit: "วิชา", href: "/data/subjects" },
  { table: "rooms", label: "ห้องเรียน", unit: "ห้อง", href: "/data/rooms" },
  { table: "student_groups", label: "กลุ่มนักเรียน", unit: "กลุ่ม", href: "/data/student_groups" },
  { table: "enrollments", label: "ภาระงานสอน", unit: "รายการ", href: "/data/enrollments" },
  { table: "schedules", label: "คาบที่จัดแล้ว", unit: "คาบ", href: "/timetable" },
];

const STEPS = [
  { no: "01", title: "ตั้งค่าภาคเรียนและข้อมูลหลัก", desc: "ตรวจสอบข้อมูลครู รายวิชา ห้องเรียน กลุ่มเรียน หรือนำเข้าจากไฟล์ CSV / Excel", href: "/data/teachers", cta: "จัดการฐานข้อมูล" },
  { no: "02", title: "ระบุเวลาที่ไม่สะดวกสอน", desc: "กำหนดช่วงวันและคาบที่ครูติดภารกิจ เพื่อไม่ให้ระบบจัดคาบสอนทับซ้อน", href: "/availability", cta: "ตั้งค่าเวลาว่าง" },
  { no: "03", title: "ประมวลผลตารางสอนอัตโนมัติ", desc: "คำนวณและจัดวางคาบเรียนทั้งหมดโดยไม่ให้ครู ห้อง หรือกลุ่มเรียนชนกัน", href: "/generate", cta: "เริ่มคำนวณตาราง" },
  { no: "04", title: "ตรวจสอบ ปรับแก้ และเผยแพร่", desc: "ลากสลับคาบเรียนได้ตามต้องการ จากนั้นกดเผยแพร่และส่งออกไฟล์ Excel หรือพิมพ์ PDF", href: "/timetable", cta: "เปิดตารางเรียน" },
];

const JOB_STATUS: Record<ScheduleJob["status"], { label: string; cls: string }> = {
  queued: { label: "อยู่ในคิว", cls: "text-slate-600" },
  running: { label: "กำลังประมวลผล", cls: "text-sky-600 dark:text-sky-400" },
  succeeded: { label: "เสร็จสมบูรณ์", cls: "text-brand-600 dark:text-brand-400" },
  failed: { label: "ไม่สำเร็จ", cls: "text-red-600 dark:text-red-400" },
};

export default function Dashboard() {
  const supabase = createClient();
  const profile = useProfile();
  const privacy = usePrivacy();
  const isAdmin = profile.role === "admin";
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [semester, setSemester] = useState<Semester | null>(null);
  const [job, setJob] = useState<ScheduleJob | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sem } = await supabase.from("semesters").select("*").eq("is_active", true).maybeSingle();
      setSemester(sem);
      const out: Record<string, number> = {};
      await Promise.all(STATS.map(async (t) => {
        let q = supabase.from(t.table).select("id", { count: "exact", head: true });
        if (sem && (t.table === "enrollments" || t.table === "schedules")) q = q.eq("semester_id", sem.id);
        const { count } = await q;
        out[t.table] = count ?? 0;
      }));
      setCounts(out);
      if (isAdmin) {
        const { data } = await supabase.from("schedule_jobs").select("*").order("created_at", { ascending: false }).limit(1);
        setJob(data?.[0] ?? null);
      }
    })();
  }, [supabase, isAdmin]);

  const name = privacy.name(profile.full_name) || privacy.email(profile.email);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/80 pb-6 dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">สวัสดี {name}</h1>
            <span className="chip-brand">{semester ? `ภาคเรียนที่ ${semester.name}` : "ยังไม่ได้ตั้งภาคเรียน"}</span>
          </div>
          <p className="page-sub">ระบบบริหารจัดการตารางเรียนและตารางสอน วิทยาลัยการอาชีพโพนทอง</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/timetable" className="btn-secondary">ดูตารางเรียน / ตารางสอน</Link>
          {isAdmin && <Link href="/generate" className="btn-primary">ประมวลผลตารางสอน</Link>}
        </div>
      </div>

      {isAdmin ? (
        <>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-label">สรุปข้อมูลในระบบปัจจุบัน</h2>
              <Link href="/import" className="link text-xs">นำเข้าข้อมูล CSV / Excel →</Link>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {STATS.map((t) => (
                <Link key={t.table} href={t.href}
                  className="card p-4 transition hover:border-brand-500/50 hover:shadow-md dark:hover:border-brand-500/40">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.label}</p>
                  <div className="mt-3 flex items-end justify-between">
                    <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{counts[t.table] ?? "–"}</span>
                    <span className="text-[11px] text-slate-400">{t.unit}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="section-label mb-3">ขั้นตอนการจัดตารางสอน (4 ขั้นตอน)</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {STEPS.map((s) => (
                <div key={s.no} className="card flex flex-col">
                  <span className="mb-3 inline-flex h-7 w-9 items-center justify-center rounded-md bg-slate-100 font-mono text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{s.no}</span>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{s.title}</h3>
                  <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{s.desc}</p>
                  <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <Link href={s.href} className="link text-xs">{s.cta} →</Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {job && (
            <div className="card flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900">
              <div>
                <p className="section-label">การประมวลผลตารางครั้งล่าสุด</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                  สถานะ: <b className={JOB_STATUS[job.status].cls}>{JOB_STATUS[job.status].label} ({job.progress}%)</b> — {job.message}
                </p>
              </div>
              <span className="font-mono text-xs text-slate-400">{new Date(job.created_at).toLocaleString("th-TH")}</span>
            </div>
          )}
        </>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card">
            <h3 className="card-title">{profile.role === "teacher" ? "ตารางสอนของฉัน" : "ตารางเรียนของกลุ่มฉัน"}</h3>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">ดูตารางที่ผู้ดูแลระบบเผยแพร่แล้ว พิมพ์ หรือส่งออกเป็น Excel ได้</p>
            <Link href="/timetable" className="btn-primary mt-4">เปิดตาราง</Link>
          </div>
          {profile.role === "teacher" && (
            <div className="card">
              <h3 className="card-title">เวลาที่ไม่สะดวกสอน</h3>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">แจ้งช่วงเวลาที่ติดภารกิจ เพื่อให้ระบบไม่จัดคาบสอนในช่วงนั้น</p>
              <Link href="/availability" className="btn-secondary mt-4">ตั้งค่าเวลาว่าง</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
