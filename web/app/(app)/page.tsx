"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePrivacy } from "@/components/Preferences";
import { useProfile } from "@/components/ProfileProvider";
import { createClient } from "@/lib/supabase/client";
import type { ScheduleJob, Semester } from "@/lib/types";

const TABLES = [
  { table: "teachers", label: "ครูผู้สอน", href: "/data/teachers" },
  { table: "subjects", label: "รายวิชา", href: "/data/subjects" },
  { table: "rooms", label: "ห้องเรียน", href: "/data/rooms" },
  { table: "student_groups", label: "กลุ่มนักเรียน", href: "/data/student_groups" },
  { table: "enrollments", label: "ภาระงานสอน", href: "/data/enrollments" },
  { table: "schedules", label: "คาบที่จัดแล้ว", href: "/timetable" },
];

export default function Dashboard() {
  const supabase = createClient();
  const profile = useProfile();
  const privacy = usePrivacy();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [semester, setSemester] = useState<Semester | null>(null);
  const [job, setJob] = useState<ScheduleJob | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sem } = await supabase.from("semesters").select("*").eq("is_active", true).maybeSingle();
      setSemester(sem);
      const out: Record<string, number> = {};
      await Promise.all(TABLES.map(async (t) => {
        let q = supabase.from(t.table).select("id", { count: "exact", head: true });
        if (sem && (t.table === "enrollments" || t.table === "schedules")) q = q.eq("semester_id", sem.id);
        const { count } = await q;
        out[t.table] = count ?? 0;
      }));
      setCounts(out);
      if (profile.role === "admin") {
        const { data } = await supabase.from("schedule_jobs").select("*").order("created_at", { ascending: false }).limit(1);
        setJob(data?.[0] ?? null);
      }
    })();
  }, [supabase, profile.role]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">สวัสดี {privacy.name(profile.full_name)}</h1>
        <p className="text-slate-500">
          ภาคเรียนปัจจุบัน: <b>{semester ? semester.name : "ยังไม่ได้ตั้งค่า"}</b>
        </p>
      </div>

      {profile.role === "admin" ? (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {TABLES.map((t) => (
              <Link key={t.table} href={t.href} className="card hover:border-brand-500">
                <p className="text-sm text-slate-500">{t.label}</p>
                <p className="text-3xl font-bold text-brand-700">{counts[t.table] ?? "–"}</p>
              </Link>
            ))}
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">ขั้นตอนการใช้งาน</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>ตั้งค่า <Link className="text-brand-600 underline" href="/data/semesters">ภาคเรียน</Link> และกำหนดเป็นภาคเรียนปัจจุบัน</li>
              <li><Link className="text-brand-600 underline" href="/import">นำเข้าข้อมูล</Link> ครู รายวิชา ห้อง กลุ่มนักเรียน และภาระงานสอน (CSV/Excel)</li>
              <li>ให้ครูกำหนด <Link className="text-brand-600 underline" href="/availability">เวลาที่ไม่สะดวกสอน</Link></li>
              <li>สั่ง <Link className="text-brand-600 underline" href="/generate">จัดตารางอัตโนมัติ</Link> แล้วรอผลแบบเรียลไทม์</li>
              <li>ตรวจ/ปรับแก้ใน <Link className="text-brand-600 underline" href="/timetable">ตารางเรียน</Link> (ลากวาง) แล้วกด &quot;เผยแพร่&quot; และส่งออก Excel/PDF</li>
            </ol>
          </div>
          {job && (
            <div className="card">
              <h2 className="mb-2 font-semibold">งานจัดตารางล่าสุด</h2>
              <p className="text-sm">สถานะ: <b>{job.status}</b> ({job.progress}%) — {job.message}</p>
              <p className="text-xs text-slate-500">{new Date(job.created_at).toLocaleString("th-TH")}</p>
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <p>ดู{profile.role === "teacher" ? "ตารางสอนของคุณ" : "ตารางเรียนของกลุ่มคุณ"}ได้ที่เมนู</p>
          <Link href="/timetable" className="btn-primary mt-3">เปิดตาราง</Link>
        </div>
      )}
    </div>
  );
}
