"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import Modal from "@/components/Modal";
import { Field, InfoGrid, Section } from "@/components/people/Parts";
import { uploadProfilePhoto } from "@/components/people/photo";
import { usePrivacy } from "@/components/Preferences";
import { useProfile, useViewAs } from "@/components/ProfileProvider";
import { ageFrom, PARENT_RELATIONS, PREFIXES, STUDENT_STATUS, thaiDate } from "@/lib/people";
import { createClient } from "@/lib/supabase/client";
import type { Semester, StudentContact, StudentRow, StudentStatus } from "@/lib/types";

interface SubjectRow {
  id: string;
  total_hours_required: number;
  subjects: { subject_code: string; subject_name: string; credits: number | null } | null;
  teachers: { name: string; teacher_code: string } | null;
}

type Form = Partial<StudentRow> & Partial<StudentContact>;

export default function StudentProfile({ studentId }: { studentId: string }) {
  const supabase = createClient();
  const privacy = usePrivacy();
  const viewer = useProfile();
  const { real, isRealAdmin, simulating } = useViewAs();
  const [s, setS] = useState<StudentRow | null>(null);
  const [contact, setContact] = useState<StudentContact | null>(null);
  const [advisorUserId, setAdvisorUserId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [semester, setSemester] = useState<Semester | null>(null);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [groups, setGroups] = useState<{ id: string; group_code: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const { data } = await supabase.from("student_directory").select("*").eq("id", studentId).maybeSingle();
    if (!data) { setNotFound(true); return; }
    const st = data as StudentRow;
    setS(st);
    const { data: c } = await supabase.from("student_contacts").select("*").eq("student_id", studentId).maybeSingle();
    setContact((c as StudentContact) ?? null);
    if (st.advisor_teacher_id) {
      const { data: adv } = await supabase.from("teachers").select("user_id").eq("id", st.advisor_teacher_id).maybeSingle();
      setAdvisorUserId(adv?.user_id ?? null);
    }
    const { data: sem } = await supabase.from("semesters").select("*").eq("is_active", true).maybeSingle();
    setSemester(sem);
    if (sem && st.student_group_id) {
      const { data: e } = await supabase.from("enrollments")
        .select("id,total_hours_required,subjects(subject_code,subject_name,credits),teachers(name,teacher_code)")
        .eq("student_group_id", st.student_group_id).eq("semester_id", sem.id);
      setSubjects(((e ?? []) as unknown as SubjectRow[]).sort((a, b) => (a.subjects?.subject_code ?? "").localeCompare(b.subjects?.subject_code ?? "")));
    }
  }, [supabase, studentId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (isRealAdmin) supabase.from("student_groups").select("id,group_code").order("group_code").then(({ data }) => setGroups(data ?? []));
  }, [supabase, isRealAdmin]);

  if (notFound) return <div className="card text-sm text-slate-500">ไม่พบข้อมูลนักเรียน หรือไม่มีสิทธิ์เข้าถึง</div>;
  if (!s) return <div className="card text-sm text-slate-400">กำลังโหลด...</div>;

  const isSelf = !!s.user_id && s.user_id === real.id;
  // ขณะจำลองมุมมอง: แสดงปุ่ม/ฟอร์มเหมือนที่ผู้ใช้จริงเห็น (นักเรียนแก้ได้เฉพาะของตนเอง, ครูแก้ไม่ได้)
  const simSelf = simulating && viewer.role === "student" && viewer.student_id === s.id;
  const adminMode = isRealAdmin && !simulating;
  const canEdit = simulating ? simSelf : isRealAdmin || isSelf;
  // กติกาเดียวกับ RLS ของ student_contacts: เจ้าของข้อมูล / ครูที่ปรึกษาของกลุ่ม / ผู้ดูแลระบบ
  // ขณะผู้ดูแลจำลองมุมมอง ให้ตัดสินตามผู้ใช้ที่จำลอง เพื่อให้เห็นเหมือนผู้ใช้จริง
  const showContact = simulating
    ? (viewer.role === "teacher" ? viewer.teacher_id === s.advisor_teacher_id : viewer.student_id === s.id)
    : isRealAdmin || isSelf || (!!advisorUserId && advisorUserId === real.id);
  const totalHours = subjects.reduce((a, r) => a + (r.total_hours_required ?? 0), 0);
  const totalCredits = subjects.reduce((a, r) => a + Number(r.subjects?.credits ?? 0), 0);
  const age = ageFrom(contact?.birth_date);

  async function save() {
    setBusy(true);
    setMsg(null);
    let error: { message: string } | null = null;
    if (simSelf) {
      // ผู้ดูแลกำลังจำลองมุมมองนักเรียน: บันทึกเฉพาะช่องที่นักเรียนแก้ได้ (ด้วยสิทธิ์ผู้ดูแล)
      ({ error } = await supabase.from("students").update({ nickname: form.nickname || null }).eq("id", studentId));
      if (!error) {
        ({ error } = await supabase.from("student_contacts").upsert({
          student_id: studentId, phone: form.phone || null, birth_date: form.birth_date || null, address: form.address || null,
          parent_name: form.parent_name || null, parent_relation: form.parent_relation || null, parent_phone: form.parent_phone || null,
        }, { onConflict: "student_id" }));
      }
    } else if (isRealAdmin) {
      ({ error } = await supabase.from("students").update({
        prefix: form.prefix || null, first_name: form.first_name, last_name: form.last_name, nickname: form.nickname || null,
        student_group_id: form.student_group_id || null, email: form.email || null,
        entry_year: form.entry_year ? Number(form.entry_year) : null, status: form.status,
      }).eq("id", studentId));
      if (!error) {
        ({ error } = await supabase.from("student_contacts").upsert({
          student_id: studentId, phone: form.phone || null, birth_date: form.birth_date || null, address: form.address || null,
          parent_name: form.parent_name || null, parent_relation: form.parent_relation || null, parent_phone: form.parent_phone || null,
        }, { onConflict: "student_id" }));
      }
    } else {
      ({ error } = await supabase.rpc("update_my_student_contact", {
        p_nickname: form.nickname ?? "", p_phone: form.phone ?? "", p_birth_date: form.birth_date || null,
        p_address: form.address ?? "", p_parent_name: form.parent_name ?? "", p_parent_relation: form.parent_relation ?? "",
        p_parent_phone: form.parent_phone ?? "",
      }));
    }
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setEditing(false);
    setMsg({ ok: true, text: "บันทึกข้อมูลแล้ว" });
    reload();
  }

  async function onPhoto(f: File | undefined) {
    if (!f || !s) return;
    setBusy(true);
    try {
      await uploadProfilePhoto("students", s.id, f, isRealAdmin);
      setMsg({ ok: true, text: "อัปเดตรูปโปรไฟล์แล้ว" });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: `อัปโหลดรูปไม่สำเร็จ: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const st = STUDENT_STATUS[s.status];

  return (
    <div className="space-y-5">
      {/* ---------- หัวโปรไฟล์ ---------- */}
      <div className="card flex flex-wrap items-center gap-5">
        <div className="relative">
          <Avatar name={s.first_name} path={s.photo_path} version={s.updated_at} size={88} />
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
            <h1 className="page-title">{privacy.name(s.full_name)}</h1>
            {s.nickname && !privacy.enabled && <span className="text-sm text-slate-500">({s.nickname})</span>}
            <span className={st.cls}>{st.label}</span>
          </div>
          <p className="page-sub">รหัสนักเรียน <span className="font-mono">{s.student_code}</span></p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {s.department && <span className="chip-gray">แผนก{s.department}</span>}
            {s.level && <span className="chip-brand">{s.level}</span>}
            {s.group_code && <span className="chip-blue">กลุ่ม {s.group_code}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.student_group_id && <Link href={`/timetable?mode=group&id=${s.student_group_id}`} className="btn-secondary">ดูตารางเรียน</Link>}
          {canEdit && (
            <button className="btn-primary" onClick={() => { setForm({ ...s, ...(contact ?? {}) }); setEditing(true); setMsg(null); }}>
              แก้ไขข้อมูล
            </button>
          )}
        </div>
      </div>
      {msg && <p className={`rounded-lg px-4 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section title="ข้อมูลการศึกษา">
            <InfoGrid items={[
              { label: "รหัสนักเรียน", value: s.student_code, mono: true },
              { label: "ชื่อ-นามสกุล", value: privacy.name(s.full_name) },
              { label: "แผนกวิชา", value: s.department },
              { label: "ระดับชั้น", value: s.level },
              { label: "กลุ่มเรียน", value: s.group_code ? `${s.group_code} — ${s.group_name}` : null },
              { label: "ครูที่ปรึกษา", value: s.advisor_name
                ? (viewer.role === "student" ? privacy.name(s.advisor_name)
                  : <Link href={`/people/teacher/${s.advisor_teacher_id}`} className="link">{privacy.name(s.advisor_name)}</Link>)
                : null },
              { label: "ปีการศึกษาที่เข้าศึกษา", value: s.entry_year, mono: true },
              { label: "สถานภาพ", value: <span className={st.cls}>{st.label}</span> },
            ]} />
          </Section>

          <Section title={`รายวิชาที่ลงทะเบียน ภาคเรียนที่ ${semester?.name ?? "-"}`}
            action={<span className="font-mono text-xs text-slate-500">{subjects.length} วิชา · {totalCredits} หน่วยกิต · {totalHours} คาบ/สัปดาห์</span>}>
            {subjects.length === 0 ? (
              <p className="text-sm text-slate-400">ยังไม่มีรายวิชาในภาคเรียนนี้</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                <table className="w-full">
                  <thead><tr><th className="th">รหัสวิชา</th><th className="th">ชื่อรายวิชา</th><th className="th">ครูผู้สอน</th><th className="th text-right">หน่วยกิต</th><th className="th text-right">คาบ/สัปดาห์</th></tr></thead>
                  <tbody>
                    {subjects.map((r) => (
                      <tr key={r.id}>
                        <td className="td font-mono text-xs font-semibold">{r.subjects?.subject_code}</td>
                        <td className="td">{r.subjects?.subject_name}</td>
                        <td className="td text-slate-500">{privacy.name(r.teachers?.name)}</td>
                        <td className="td text-right font-mono">{r.subjects?.credits ?? "-"}</td>
                        <td className="td text-right font-mono">{r.total_hours_required}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="ข้อมูลส่วนตัวและการติดต่อ">
            {showContact ? (
              <InfoGrid items={[
                { label: "ชื่อเล่น", value: privacy.secret(s.nickname) },
                { label: "วันเกิด", value: privacy.enabled ? privacy.secret(contact?.birth_date) : contact?.birth_date ? `${thaiDate(contact.birth_date)}${age !== null ? ` (${age} ปี)` : ""}` : null },
                { label: "เบอร์โทรศัพท์", value: privacy.phone(contact?.phone), mono: true },
                { label: "อีเมล", value: privacy.email(s.email), mono: true },
                { label: "ที่อยู่", value: privacy.secret(contact?.address) },
              ]} />
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
                🔒 ข้อมูลส่วนนี้แสดงเฉพาะต่อเจ้าของข้อมูล ครูที่ปรึกษา และผู้ดูแลระบบ ตามนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
              </p>
            )}
          </Section>
          {showContact && (
            <Section title="ข้อมูลผู้ปกครอง">
              <InfoGrid items={[
                { label: "ชื่อผู้ปกครอง", value: privacy.name(contact?.parent_name) },
                { label: "ความเกี่ยวข้อง", value: contact?.parent_relation },
                { label: "เบอร์โทรผู้ปกครอง", value: privacy.phone(contact?.parent_phone), mono: true },
              ]} />
            </Section>
          )}
        </div>
      </div>

      {editing && (
        <Modal title={adminMode ? "แก้ไขข้อมูลนักเรียน" : "แก้ไขข้อมูลส่วนตัวของฉัน"} wide onClose={() => setEditing(false)}
          footer={<>
            <button className="btn-secondary" onClick={() => setEditing(false)}>ยกเลิก</button>
            <button className="btn-primary" disabled={busy} onClick={save}>บันทึก</button>
          </>}>
          <div className="grid gap-4 sm:grid-cols-2">
            {adminMode ? (
              <>
                <Field label="คำนำหน้า">
                  <select className="input" value={form.prefix ?? ""} onChange={set("prefix")}>
                    <option value="">—</option>{PREFIXES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="ชื่อเล่น"><input className="input" value={form.nickname ?? ""} onChange={set("nickname")} /></Field>
                <Field label="ชื่อ"><input className="input" value={form.first_name ?? ""} onChange={set("first_name")} /></Field>
                <Field label="นามสกุล"><input className="input" value={form.last_name ?? ""} onChange={set("last_name")} /></Field>
                <Field label="กลุ่มเรียน" hint="แผนกวิชาและระดับชั้นอ้างอิงจากกลุ่มเรียน">
                  <select className="input" value={form.student_group_id ?? ""} onChange={set("student_group_id")}>
                    <option value="">—</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.group_code}</option>)}
                  </select>
                </Field>
                <Field label="สถานภาพ">
                  <select className="input" value={form.status ?? "studying"} onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatus })}>
                    {Object.entries(STUDENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </Field>
                <Field label="ปีการศึกษาที่เข้าศึกษา"><input className="input" type="number" value={form.entry_year ?? ""} onChange={set("entry_year")} /></Field>
                <Field label="อีเมล (ใช้ผูกบัญชีล็อกอิน)"><input className="input" type="email" value={form.email ?? ""} onChange={set("email")} /></Field>
              </>
            ) : (
              <Field label="ชื่อเล่น"><input className="input" value={form.nickname ?? ""} onChange={set("nickname")} /></Field>
            )}
            <Field label="วันเกิด"><input className="input" type="date" value={form.birth_date ?? ""} onChange={set("birth_date")} /></Field>
            <Field label="เบอร์โทรศัพท์"><input className="input" value={form.phone ?? ""} onChange={set("phone")} placeholder="08x-xxx-xxxx" /></Field>
            <div className="sm:col-span-2">
              <Field label="ที่อยู่"><textarea className="input" rows={2} value={form.address ?? ""} onChange={set("address")} /></Field>
            </div>
            <Field label="ชื่อผู้ปกครอง"><input className="input" value={form.parent_name ?? ""} onChange={set("parent_name")} /></Field>
            <Field label="ความเกี่ยวข้อง">
              <select className="input" value={form.parent_relation ?? ""} onChange={set("parent_relation")}>
                <option value="">—</option>{PARENT_RELATIONS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="เบอร์โทรผู้ปกครอง"><input className="input" value={form.parent_phone ?? ""} onChange={set("parent_phone")} /></Field>
          </div>
          {!adminMode && <p className="mt-4 text-[11px] text-slate-400">ชื่อ-สกุล รหัส และกลุ่มเรียน แก้ไขได้โดยผู้ดูแลระบบเท่านั้น หากไม่ถูกต้องให้ยื่นคำร้องที่เมนู “ข้อมูลส่วนบุคคล (PDPA)”</p>}
          {msg && !msg.ok && <p className="mt-3 text-sm text-red-600">{msg.text}</p>}
        </Modal>
      )}
    </div>
  );
}
