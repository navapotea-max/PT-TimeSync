"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrivacy } from "@/components/Preferences";
import { useViewAs, type ViewAs } from "@/components/ProfileProvider";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

export const ROLE_TH: Record<Role, string> = { admin: "ผู้ดูแลระบบ", teacher: "ครูผู้สอน", student: "นักเรียน" };

/** หน้าที่แต่ละบทบาทเข้าได้ (ใช้ตัดสินว่าต้องพากลับหน้าแรกหรือไม่เมื่อสลับมุมมอง) */
const ALLOWED: Record<Role, string[]> = {
  admin: ["*"],
  teacher: ["/", "/timetable", "/availability", "/profile", "/directory", "/people", "/pdpa", "/privacy"],
  student: ["/", "/timetable", "/profile", "/pdpa", "/privacy"],
};

interface Opt { id: string; label: string }

/** ตัวเลือกมุมมองผู้ใช้งาน (แสดงเฉพาะบัญชีผู้ดูแลระบบ) */
export function ViewAsSwitcher() {
  const { isRealAdmin, view, setView } = useViewAs();
  const privacy = usePrivacy();
  const router = useRouter();
  const path = usePathname();
  const [teachers, setTeachers] = useState<Opt[]>([]);
  const [groups, setGroups] = useState<Opt[]>([]);
  const [rawTeachers, setRawTeachers] = useState<{ id: string; teacher_code: string; name: string }[]>([]);
  const [students, setStudents] = useState<{ id: string; student_code: string; full_name: string; student_group_id: string | null }[]>([]);

  useEffect(() => {
    if (!isRealAdmin) return;
    const sb = createClient();
    sb.from("teachers").select("id,teacher_code,name").order("teacher_code").then(({ data }) => setRawTeachers(data ?? []));
    sb.from("student_groups").select("id,group_code,group_name").order("group_code")
      .then(({ data }) => setGroups((data ?? []).map((g: { id: string; group_code: string; group_name: string }) => ({ id: g.id, label: `${g.group_code} — ${g.group_name}` }))));
    // ตาราง students อาจยังไม่มี (ยังไม่ได้รัน migration โปรไฟล์) -> ไม่เป็นไร ใช้แค่กลุ่มเรียน
    sb.from("student_directory").select("id,student_code,full_name,student_group_id").order("student_code")
      .then(({ data }) => setStudents(data ?? []));
  }, [isRealAdmin]);

  useEffect(() => {
    setTeachers(rawTeachers.map((t) => ({ id: t.id, label: `${t.teacher_code} — ${privacy.name(t.name)}` })));
  }, [rawTeachers, privacy]);

  if (!isRealAdmin) return null;

  function apply(next: ViewAs) {
    if (next.role === "teacher" && !next.teacherId) next = { ...next, teacherId: teachers[0]?.id ?? null };
    if (next.role === "student" && !next.groupId) next = { ...next, groupId: groups[0]?.id ?? null };
    if (next.role === "student") {
      const inGroup = students.filter((s) => s.student_group_id === next.groupId);
      if (!inGroup.some((s) => s.id === next.studentId)) next = { ...next, studentId: inGroup[0]?.id ?? null };
    }
    setView(next);
    const allowed = ALLOWED[next.role];
    const ok = allowed.includes("*") || allowed.some((p) => (p === "/" ? path === "/" : path.startsWith(p)));
    if (!ok) router.push("/");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hidden text-xs text-slate-400 xl:inline">มุมมองผู้ใช้งาน:</span>
      <div className="seg" role="group" aria-label="มุมมองผู้ใช้งาน">
        {(["admin", "teacher", "student"] as Role[]).map((r) => (
          <button key={r} type="button" aria-pressed={view.role === r}
            onClick={() => apply({ ...view, role: r })}
            className={`seg-btn px-2.5 py-1 ${view.role === r ? "seg-btn-active" : ""}`}>
            {ROLE_TH[r]}
          </button>
        ))}
      </div>
      {view.role === "teacher" && (
        <select className="input w-auto max-w-[220px] py-1 text-xs" aria-label="เลือกครูผู้สอน" value={view.teacherId ?? ""}
          onChange={(e) => apply({ ...view, teacherId: e.target.value })}>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      )}
      {view.role === "student" && (
        <select className="input w-auto max-w-[220px] py-1 text-xs" aria-label="เลือกกลุ่มนักเรียน" value={view.groupId ?? ""}
          onChange={(e) => apply({ ...view, groupId: e.target.value, studentId: null })}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      )}
      {view.role === "student" && students.some((s) => s.student_group_id === view.groupId) && (
        <select className="input w-auto max-w-[200px] py-1 text-xs" aria-label="เลือกนักเรียน" value={view.studentId ?? ""}
          onChange={(e) => apply({ ...view, studentId: e.target.value })}>
          {students.filter((s) => s.student_group_id === view.groupId).map((s) => (
            <option key={s.id} value={s.id}>{s.student_code} {privacy.name(s.full_name)}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/** แถบแจ้งเตือนขณะจำลองมุมมอง */
export function ViewAsBanner() {
  const { simulating, view, setView, real } = useViewAs();
  const router = useRouter();
  const [who, setWho] = useState<string>("");
  const privacy = usePrivacy();

  useEffect(() => {
    if (!simulating) return;
    const sb = createClient();
    if (view.role === "teacher" && view.teacherId) {
      sb.from("teachers").select("teacher_code,name").eq("id", view.teacherId).maybeSingle()
        .then(({ data }) => setWho(data ? `${data.teacher_code} ${privacy.name(data.name)}` : ""));
    } else if (view.role === "student" && view.studentId) {
      sb.from("student_directory").select("student_code,full_name,group_code").eq("id", view.studentId).maybeSingle()
        .then(({ data }) => setWho(data ? `${data.student_code} ${privacy.name(data.full_name)} (กลุ่ม ${data.group_code})` : ""));
    } else if (view.role === "student" && view.groupId) {
      sb.from("student_groups").select("group_code,group_name").eq("id", view.groupId).maybeSingle()
        .then(({ data }) => setWho(data ? `กลุ่ม ${data.group_code} ${data.group_name}` : ""));
    }
  }, [simulating, view, privacy]);

  if (!simulating) return null;
  return (
    <div className="no-print flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <span>
        กำลังแสดงผลในมุมมอง <b>{ROLE_TH[view.role]}</b>{who && <> — {who}</>} · แสดงเฉพาะสิ่งที่ผู้ใช้จริงมองเห็น (ตารางที่เผยแพร่แล้ว)
      </span>
      <button type="button" className="font-semibold underline"
        onClick={() => { setView({ role: real.role, teacherId: null, groupId: null, studentId: null }); router.refresh(); }}>
        กลับสู่มุมมองผู้ดูแลระบบ
      </button>
    </div>
  );
}
