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
  teacher: ["/", "/timetable", "/availability", "/pdpa", "/privacy"],
  student: ["/", "/timetable", "/pdpa", "/privacy"],
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

  useEffect(() => {
    if (!isRealAdmin) return;
    const sb = createClient();
    sb.from("teachers").select("id,teacher_code,name").order("teacher_code").then(({ data }) => setRawTeachers(data ?? []));
    sb.from("student_groups").select("id,group_code,group_name").order("group_code")
      .then(({ data }) => setGroups((data ?? []).map((g: { id: string; group_code: string; group_name: string }) => ({ id: g.id, label: `${g.group_code} — ${g.group_name}` }))));
  }, [isRealAdmin]);

  useEffect(() => {
    setTeachers(rawTeachers.map((t) => ({ id: t.id, label: `${t.teacher_code} — ${privacy.name(t.name)}` })));
  }, [rawTeachers, privacy]);

  if (!isRealAdmin) return null;

  function apply(next: ViewAs) {
    if (next.role === "teacher" && !next.teacherId) next = { ...next, teacherId: teachers[0]?.id ?? null };
    if (next.role === "student" && !next.groupId) next = { ...next, groupId: groups[0]?.id ?? null };
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
          onChange={(e) => apply({ ...view, groupId: e.target.value })}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
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
        onClick={() => { setView({ role: real.role, teacherId: null, groupId: null }); router.refresh(); }}>
        กลับสู่มุมมองผู้ดูแลระบบ
      </button>
    </div>
  );
}
