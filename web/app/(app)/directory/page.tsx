"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Avatar from "@/components/Avatar";
import { IconSearch } from "@/components/Icons";
import PageHeader from "@/components/PageHeader";
import { usePrivacy } from "@/components/Preferences";
import { useProfile } from "@/components/ProfileProvider";
import { STUDENT_STATUS } from "@/lib/people";
import { createClient } from "@/lib/supabase/client";
import type { StudentRow, StudentStatus, TeacherFull } from "@/lib/types";

type Tab = "teachers" | "students";

type Ranged = { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };

async function fetchAll<T>(q: () => Ranged): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export default function DirectoryPage() {
  const supabase = createClient();
  const profile = useProfile();
  const privacy = usePrivacy();
  const [tab, setTab] = useState<Tab>("students");
  const [teachers, setTeachers] = useState<TeacherFull[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [advisorOf, setAdvisorOf] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [level, setLevel] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState<"" | StudentStatus>("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "teachers" || t === "students") setTab(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [t, s, g] = await Promise.all([
          fetchAll<TeacherFull>(() => supabase.from("teachers").select("*").order("teacher_code")),
          fetchAll<StudentRow>(() => supabase.from("student_directory").select("*").order("student_code")),
          supabase.from("student_groups").select("group_code,advisor_teacher_id").order("group_code"),
        ]);
        setTeachers(t);
        setStudents(s);
        const m: Record<string, string[]> = {};
        (g.data ?? []).forEach((x: { group_code: string; advisor_teacher_id: string | null }) => {
          if (x.advisor_teacher_id) (m[x.advisor_teacher_id] ??= []).push(x.group_code);
        });
        setAdvisorOf(m);
      } catch (e) {
        setError(`โหลดข้อมูลไม่สำเร็จ: ${(e as Error).message} (ผู้ดูแลระบบรันไฟล์ SQL โปรไฟล์แล้วหรือยัง?)`);
      }
    })();
  }, [supabase]);

  const depts = useMemo(() => Array.from(new Set([
    ...students.map((s) => s.department), ...teachers.map((t) => t.department),
  ].filter(Boolean) as string[])).sort(), [students, teachers]);
  const levels = useMemo(() => Array.from(new Set(students.map((s) => s.level).filter(Boolean) as string[])).sort(), [students]);
  const groups = useMemo(() => Array.from(new Set(students
    .filter((s) => (!dept || s.department === dept) && (!level || s.level === level))
    .map((s) => s.group_code).filter(Boolean) as string[])).sort(), [students, dept, level]);

  const needle = q.trim().toLowerCase();
  const fStudents = students.filter((s) =>
    (!dept || s.department === dept) && (!level || s.level === level) && (!group || s.group_code === group)
    && (!status || s.status === status)
    && (!needle || [s.student_code, s.full_name, s.nickname, s.group_code].some((v) => v?.toLowerCase().includes(needle))));
  const fTeachers = teachers.filter((t) =>
    (!dept || t.department === dept)
    && (!needle || [t.teacher_code, t.name, t.position, t.department].some((v) => v?.toLowerCase().includes(needle))));

  if (profile.role === "student") return <div className="card text-sm text-slate-500">หน้านี้สำหรับครูและผู้ดูแลระบบ</div>;

  return (
    <div className="space-y-5">
      <PageHeader title="รายชื่อครูและนักเรียน"
        subtitle="ข้อมูลบุคลากรและนักเรียน วิทยาลัยการอาชีพโพนทอง — คลิกที่รายชื่อเพื่อดูโปรไฟล์"
        actions={profile.role === "admin" ? (
          <>
            <Link href="/data/students" className="btn-secondary">จัดการข้อมูลนักเรียน</Link>
            <Link href="/import" className="btn-primary">นำเข้ารายชื่อ (CSV / Excel)</Link>
          </>
        ) : undefined} />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="seg">
          <button type="button" onClick={() => setTab("students")} className={`seg-btn ${tab === "students" ? "seg-btn-active" : ""}`}>
            นักเรียน <span className="font-mono">({students.length})</span>
          </button>
          <button type="button" onClick={() => setTab("teachers")} className={`seg-btn ${tab === "teachers" ? "seg-btn-active" : ""}`}>
            ครูผู้สอน <span className="font-mono">({teachers.length})</span>
          </button>
        </div>
        <div className="relative min-w-[200px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder={tab === "students" ? "ค้นหารหัส ชื่อ ชื่อเล่น กลุ่ม..." : "ค้นหารหัส ชื่อ ตำแหน่ง..."}
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={dept} onChange={(e) => { setDept(e.target.value); setGroup(""); }} aria-label="แผนกวิชา">
          <option value="">ทุกแผนกวิชา</option>{depts.map((d) => <option key={d}>{d}</option>)}
        </select>
        {tab === "students" && (
          <>
            <select className="input w-auto" value={level} onChange={(e) => { setLevel(e.target.value); setGroup(""); }} aria-label="ระดับชั้น">
              <option value="">ทุกระดับชั้น</option>{levels.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="input w-auto" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="กลุ่มเรียน">
              <option value="">ทุกกลุ่มเรียน</option>{groups.map((d) => <option key={d}>{d}</option>)}
            </select>
            <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as StudentStatus | "")} aria-label="สถานภาพ">
              <option value="">ทุกสถานภาพ</option>
              {Object.entries(STUDENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          {tab === "students" ? (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">นักเรียน</th><th className="th">รหัส</th><th className="th">แผนกวิชา</th>
                  <th className="th">ชั้น</th><th className="th">กลุ่มเรียน</th><th className="th">ครูที่ปรึกษา</th><th className="th">สถานภาพ</th>
                </tr>
              </thead>
              <tbody>
                {fStudents.map((s) => (
                  <tr key={s.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="td">
                      <Link href={`/people/student/${s.id}`} className="flex items-center gap-3">
                        <Avatar name={s.first_name} path={s.photo_path} version={s.updated_at} size={32} />
                        <span>
                          <span className="block font-medium text-slate-900 hover:underline dark:text-white">{privacy.name(s.full_name)}</span>
                          {s.nickname && !privacy.enabled && <span className="text-[11px] text-slate-400">({s.nickname})</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="td font-mono text-xs">{s.student_code}</td>
                    <td className="td text-slate-500">{s.department ?? "-"}</td>
                    <td className="td">{s.level ?? "-"}</td>
                    <td className="td font-medium">{s.group_code ?? "-"}</td>
                    <td className="td text-slate-500">{privacy.name(s.advisor_name) || "-"}</td>
                    <td className="td"><span className={STUDENT_STATUS[s.status].cls}>{STUDENT_STATUS[s.status].label}</span></td>
                  </tr>
                ))}
                {fStudents.length === 0 && <tr><td className="td text-center text-slate-400" colSpan={7}>ไม่พบรายชื่อนักเรียน</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">ครูผู้สอน</th><th className="th">รหัส</th><th className="th">แผนกวิชา</th>
                  <th className="th">ตำแหน่ง / วิทยฐานะ</th><th className="th">ครูที่ปรึกษากลุ่ม</th><th className="th">บัญชีผู้ใช้</th>
                </tr>
              </thead>
              <tbody>
                {fTeachers.map((t) => (
                  <tr key={t.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="td">
                      <Link href={`/people/teacher/${t.id}`} className="flex items-center gap-3">
                        <Avatar name={t.name} path={t.photo_path} version={t.updated_at} size={32} />
                        <span className="font-medium text-slate-900 hover:underline dark:text-white">{privacy.name(t.name)}</span>
                      </Link>
                    </td>
                    <td className="td font-mono text-xs">{t.teacher_code}</td>
                    <td className="td text-slate-500">{t.department ?? "-"}</td>
                    <td className="td">{t.position ?? "-"}{t.academic_standing && <span className="text-slate-400"> · {t.academic_standing}</span>}</td>
                    <td className="td">{(advisorOf[t.id] ?? []).map((g) => <span key={g} className="chip-blue mr-1">{g}</span>)}</td>
                    <td className="td">{t.user_id ? <span className="chip-green">ผูกแล้ว</span> : <span className="chip-gray">ยังไม่ผูก</span>}</td>
                  </tr>
                ))}
                {fTeachers.length === 0 && <tr><td className="td text-center text-slate-400" colSpan={6}>ไม่พบรายชื่อครู</td></tr>}
              </tbody>
            </table>
          )}
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400 dark:border-slate-800">
          แสดง {tab === "students" ? fStudents.length : fTeachers.length} รายการ
          {tab === "students" && " · ข้อมูลติดต่อและผู้ปกครองเห็นได้เฉพาะครูที่ปรึกษาและผู้ดูแลระบบ (PDPA)"}
        </p>
      </div>
    </div>
  );
}
