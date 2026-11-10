"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import Modal from "@/components/Modal";
import { Field, InfoGrid, Section } from "@/components/people/Parts";
import { uploadProfilePhoto } from "@/components/people/photo";
import { usePrivacy } from "@/components/Preferences";
import { useProfile, useViewAs } from "@/components/ProfileProvider";
import { ACADEMIC_STANDINGS, STUDENT_STATUS, TEACHER_POSITIONS } from "@/lib/people";
import { createClient } from "@/lib/supabase/client";
import type { Semester, StudentRow, TeacherFull } from "@/lib/types";

interface LoadRow {
  id: string;
  total_hours_required: number;
  subjects: { subject_code: string; subject_name: string; theory_hours: number; lab_hours: number } | null;
  student_groups: { group_code: string; group_name: string } | null;
}

export default function TeacherProfile({ teacherId }: { teacherId: string }) {
  const supabase = createClient();
  const privacy = usePrivacy();
  const { real, isRealAdmin, simulating } = useViewAs();
  const viewer = useProfile();
  const [t, setT] = useState<TeacherFull | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [semester, setSemester] = useState<Semester | null>(null);
  const [load, setLoad] = useState<LoadRow[]>([]);
  const [advisees, setAdvisees] = useState<StudentRow[]>([]);
  const [groups, setGroups] = useState<{ id: string; group_code: string; group_name: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<TeacherFull>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const { data } = await supabase.from("teachers").select("*").eq("id", teacherId).maybeSingle();
    if (!data) { setNotFound(true); return; }
    setT(data as TeacherFull);
    const { data: sem } = await supabase.from("semesters").select("*").eq("is_active", true).maybeSingle();
    setSemester(sem);
    if (sem) {
      const { data: l } = await supabase.from("enrollments")
        .select("id,total_hours_required,subjects(subject_code,subject_name,theory_hours,lab_hours),student_groups(group_code,group_name)")
        .eq("teacher_id", teacherId).eq("semester_id", sem.id);
      setLoad(((l ?? []) as unknown as LoadRow[]).sort((a, b) => (a.subjects?.subject_code ?? "").localeCompare(b.subjects?.subject_code ?? "")));
    }
    const { data: g } = await supabase.from("student_groups").select("id,group_code,group_name").eq("advisor_teacher_id", teacherId).order("group_code");
    setGroups(g ?? []);
    const { data: s } = await supabase.from("student_directory").select("*").eq("advisor_teacher_id", teacherId).order("student_code");
    setAdvisees((s ?? []) as StudentRow[]);
  }, [supabase, teacherId]);

  useEffect(() => { reload(); }, [reload]);

  if (notFound) return <div className="card text-sm text-slate-500">ไม่พบข้อมูลครู หรือไม่มีสิทธิ์เข้าถึง</div>;
  if (!t) return <div className="card text-sm text-slate-400">กำลังโหลด...</div>;

  const isSelf = !!t.user_id && t.user_id === real.id;
  // ขณะจำลองมุมมอง: ครูแก้ได้เฉพาะโปรไฟล์ตนเอง นักเรียนแก้ไม่ได้
  const simSelf = simulating && viewer.role === "teacher" && viewer.teacher_id === t.id;
  const adminMode = isRealAdmin && !simulating;
  const canEdit = simulating ? simSelf : isRealAdmin || isSelf;
  const totalHours = load.reduce((a, r) => a + (r.total_hours_required ?? 0), 0);
  const pct = Math.min(100, Math.round((totalHours / Math.max(1, t.max_hours_per_week)) * 100));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = simSelf
      ? await supabase.from("teachers").update({ phone: form.phone || null, education: form.education || null }).eq("id", teacherId)
      : isRealAdmin
      ? await supabase.from("teachers").update({
          name: form.name, department: form.department || null, position: form.position || null,
          academic_standing: form.academic_standing || null, education: form.education || null,
          phone: form.phone || null, email: form.email || null, max_hours_per_week: Number(form.max_hours_per_week) || 24,
        }).eq("id", teacherId)
      : await supabase.rpc("update_my_teacher_contact", { p_phone: form.phone ?? "", p_education: form.education ?? "" });
    setBusy(false);
    if (res.error) return setMsg({ ok: false, text: res.error.message });
    setEditing(false);
    setMsg({ ok: true, text: "บันทึกข้อมูลแล้ว" });
    reload();
  }

  async function onPhoto(f: File | undefined) {
    if (!f || !t) return;
    setBusy(true);
    try {
      await uploadProfilePhoto("teachers", t.id, f, isRealAdmin);
      setMsg({ ok: true, text: "อัปเดตรูปโปรไฟล์แล้ว" });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: `อัปโหลดรูปไม่สำเร็จ: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof TeacherFull) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-5">
      {/* ---------- หัวโปรไฟล์ ---------- */}
      <div className="card flex flex-wrap items-center gap-5">
        <div className="relative">
          <Avatar name={t.name} path={t.photo_path} version={t.updated_at} size={88} />
          {canEdit && (
            <>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                className="absolute -bottom-1 -right-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                เปลี่ยนรูป
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title">{privacy.name(t.name)}</h1>
            <span className="chip-brand">ครูผู้สอน</span>
          </div>
          <p className="page-sub">
            <span className="font-mono">{t.teacher_code}</span>
            {t.position && <> · {t.position}</>}
            {t.academic_standing && <> วิทยฐานะ{t.academic_standing}</>}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {t.department && <span className="chip-gray">แผนก{t.department}</span>}
            {groups.map((g) => <span key={g.id} className="chip-blue">ครูที่ปรึกษา {g.group_code}</span>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/timetable?mode=teacher&id=${t.id}`} className="btn-secondary">ดูตารางสอน</Link>
          {canEdit && <button className="btn-primary" onClick={() => { setForm(t); setEditing(true); setMsg(null); }}>แก้ไขข้อมูล</button>}
        </div>
      </div>
      {msg && <p className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title={`ภาระงานสอน ภาคเรียนที่ ${semester?.name ?? "-"}`}
            action={<span className="font-mono text-xs text-slate-500">{totalHours}/{t.max_hours_per_week} คาบ/สัปดาห์</span>}>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-full rounded-full ${totalHours > t.max_hours_per_week ? "bg-red-500" : "bg-brand-600 dark:bg-brand-500"}`} style={{ width: `${pct}%` }} />
            </div>
            {load.length === 0 ? (
              <p className="text-sm text-slate-400">ยังไม่มีภาระงานสอนในภาคเรียนนี้</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                <table className="w-full">
                  <thead><tr><th className="th">รหัสวิชา</th><th className="th">ชื่อรายวิชา</th><th className="th">กลุ่มเรียน</th><th className="th text-right">ท-ป</th><th className="th text-right">คาบ/สัปดาห์</th></tr></thead>
                  <tbody>
                    {load.map((r) => (
                      <tr key={r.id}>
                        <td className="td font-mono text-xs font-semibold">{r.subjects?.subject_code}</td>
                        <td className="td">{r.subjects?.subject_name}</td>
                        <td className="td text-slate-500">{r.student_groups?.group_code}</td>
                        <td className="td text-right font-mono text-xs text-slate-500">{r.subjects?.theory_hours}-{r.subjects?.lab_hours}</td>
                        <td className="td text-right font-mono">{r.total_hours_required}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {groups.length > 0 && (
            <Section title={`นักเรียนในความดูแล (ครูที่ปรึกษา) — ${advisees.length} คน`}>
              {advisees.length === 0 ? (
                <p className="text-sm text-slate-400">ยังไม่มีรายชื่อนักเรียน</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {advisees.map((s) => (
                    <li key={s.id}>
                      <Link href={`/people/student/${s.id}`} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2.5 transition hover:border-brand-500/40 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                        <Avatar name={s.first_name} path={s.photo_path} version={s.updated_at} size={34} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{privacy.name(s.full_name)}</p>
                          <p className="text-[11px] text-slate-500"><span className="font-mono">{s.student_code}</span> · {s.group_code}</p>
                        </div>
                        <span className={`ml-auto ${STUDENT_STATUS[s.status].cls}`}>{STUDENT_STATUS[s.status].label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-5">
          <Section title="ข้อมูลบุคลากร">
            <InfoGrid items={[
              { label: "รหัสครู", value: t.teacher_code, mono: true },
              { label: "แผนกวิชา", value: t.department },
              { label: "ตำแหน่ง", value: t.position },
              { label: "วิทยฐานะ", value: t.academic_standing },
              { label: "วุฒิการศึกษา", value: t.education },
              { label: "คาบสอนสูงสุด/สัปดาห์", value: t.max_hours_per_week, mono: true },
            ]} />
          </Section>
          <Section title="ข้อมูลติดต่อ">
            <InfoGrid items={[
              { label: "อีเมล", value: privacy.email(t.email), mono: true },
              { label: "เบอร์ติดต่อ (สำหรับงาน)", value: privacy.phone(t.phone), mono: true },
              { label: "บัญชีผู้ใช้", value: t.user_id ? <span className="chip-green">ผูกบัญชีแล้ว</span> : <span className="chip-gray">ยังไม่ผูกบัญชี</span> },
            ]} />
          </Section>
        </div>
      </div>

      {editing && (
        <Modal title={adminMode ? "แก้ไขข้อมูลครู" : "แก้ไขข้อมูลติดต่อของฉัน"} onClose={() => setEditing(false)} wide={adminMode}
          footer={<>
            <button className="btn-secondary" onClick={() => setEditing(false)}>ยกเลิก</button>
            <button className="btn-primary" disabled={busy} onClick={save}>บันทึก</button>
          </>}>
          <div className={`grid gap-4 ${adminMode ? "sm:grid-cols-2" : ""}`}>
            {adminMode && (
              <>
                <Field label="ชื่อ-สกุล"><input className="input" value={form.name ?? ""} onChange={set("name")} /></Field>
                <Field label="แผนกวิชา"><input className="input" value={form.department ?? ""} onChange={set("department")} /></Field>
                <Field label="ตำแหน่ง">
                  <select className="input" value={form.position ?? ""} onChange={set("position")}>
                    <option value="">—</option>{TEACHER_POSITIONS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="วิทยฐานะ">
                  <select className="input" value={form.academic_standing ?? ""} onChange={set("academic_standing")}>
                    <option value="">—</option>{ACADEMIC_STANDINGS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="อีเมล (ใช้ผูกบัญชีล็อกอิน)"><input className="input" type="email" value={form.email ?? ""} onChange={set("email")} /></Field>
                <Field label="คาบสอนสูงสุด/สัปดาห์"><input className="input" type="number" value={form.max_hours_per_week ?? 24} onChange={set("max_hours_per_week")} /></Field>
              </>
            )}
            <Field label="วุฒิการศึกษา"><input className="input" value={form.education ?? ""} onChange={set("education")} placeholder="เช่น ค.อ.บ. วิศวกรรมเครื่องกล" /></Field>
            <Field label="เบอร์ติดต่อ (สำหรับงาน)"><input className="input" value={form.phone ?? ""} onChange={set("phone")} placeholder="08x-xxx-xxxx" /></Field>
          </div>
          {msg && !msg.ok && <p className="mt-3 text-sm text-red-600">{msg.text}</p>}
        </Modal>
      )}
    </div>
  );
}
