"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TimetableGrid, { toSessions, type Session, type ViewMode } from "@/components/TimetableGrid";
import { useProfile } from "@/components/ProfileProvider";
import { conflictsForMove, findConflicts } from "@/lib/conflicts";
import { configOf, DAY_NAMES, roomTypeLabel } from "@/lib/constants";
import { buildWorkbook, type SheetSpec } from "@/lib/exportExcel";
import { createClient } from "@/lib/supabase/client";
import type { Room, ScheduleRow, Semester, StudentGroup, Teacher } from "@/lib/types";

const MODE_LABEL: Record<ViewMode, string> = { group: "ตารางเรียน (กลุ่ม)", teacher: "ตารางสอน (ครู)", room: "ตารางการใช้ห้อง" };

export default function TimetablePage() {
  const supabase = createClient();
  const profile = useProfile();
  const isAdmin = profile.role === "admin";

  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [semesterId, setSemesterId] = useState("");
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [mode, setMode] = useState<ViewMode>(profile.role === "teacher" ? "teacher" : "group");
  const [targetId, setTargetId] = useState("");
  const [selected, setSelected] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const semester = semesters.find((s) => s.id === semesterId) ?? null;
  const config = configOf(semester);

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      const [sem, rm, tc, gr] = await Promise.all([
        supabase.from("semesters").select("*").order("academic_year", { ascending: false }).order("term", { ascending: false }),
        supabase.from("rooms").select("*").order("room_code"),
        supabase.from("teachers").select("id,user_id,teacher_code,name,unavailable_times").order("teacher_code"),
        supabase.from("student_groups").select("id,group_code,group_name").order("group_code"),
      ]);
      setSemesters(sem.data ?? []);
      setRooms(rm.data ?? []);
      setTeachers(tc.data ?? []);
      setGroups(gr.data ?? []);
      const act = (sem.data ?? []).find((s: Semester) => s.is_active) ?? sem.data?.[0];
      if (act) setSemesterId(act.id);
      if (profile.role === "teacher") {
        const me = (tc.data ?? []).find((t: Teacher) => t.user_id === profile.id);
        if (me) setTargetId(me.id);
      } else if (profile.role === "student" && profile.student_group_id) {
        setTargetId(profile.student_group_id);
      }
    })();
  }, [supabase, profile]);

  const loadRows = useCallback(async () => {
    if (!semesterId) return;
    const all: ScheduleRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("schedule_details").select("*")
        .eq("semester_id", semesterId).order("id").range(from, from + 999);
      if (error) { setNotice(error.message); break; }
      all.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    setRows(all);
  }, [supabase, semesterId]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // ---------- derived ----------
  const targets = useMemo(() => {
    if (mode === "group") return groups.map((g) => ({ id: g.id, label: `${g.group_code} — ${g.group_name}` }));
    if (mode === "teacher") return teachers.map((t) => ({ id: t.id, label: `${t.teacher_code} — ${t.name}` }));
    return rooms.map((r) => ({ id: r.id, label: `${r.room_code} — ${r.room_name}` }));
  }, [mode, groups, teachers, rooms]);

  useEffect(() => {
    if (targets.length && !targets.some((t) => t.id === targetId)) setTargetId(targets[0].id);
  }, [targets, targetId]);

  const matchRow = useCallback((r: ScheduleRow, m: ViewMode, id: string) =>
    m === "group" ? r.student_group_id === id : m === "teacher" ? r.teacher_id === id : r.room_id === id, []);

  const viewSessions = useMemo(() => {
    const keys = new Set(rows.filter((r) => matchRow(r, mode, targetId)).map((r) => r.session_key));
    return toSessions(rows.filter((r) => keys.has(r.session_key)));
  }, [rows, mode, targetId, matchRow]);

  const conflicts = useMemo(() => findConflicts(rows), [rows]);
  const conflictKeys = useMemo(() => new Set(conflicts.flatMap((c) => c.sessionKeys)), [conflicts]);
  const stats = useMemo(() => ({
    draft: rows.filter((r) => r.status === "draft").length,
    published: rows.filter((r) => r.status === "published").length,
  }), [rows]);

  const summary = useMemo(() => {
    const m = new Map<string, { code: string; name: string; who: string; hours: number }>();
    viewSessions.forEach((s) => {
      const r = s.rows[0];
      const who = mode === "group" ? r.teacher_name : Array.from(new Set(s.rows.map((x) => x.group_code))).join(", ");
      const k = `${r.subject_code}|${who}`;
      const e = m.get(k) ?? { code: r.subject_code, name: r.subject_name, who, hours: 0 };
      e.hours += s.end - s.start + 1;
      m.set(k, e);
    });
    return Array.from(m.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [viewSessions, mode]);

  // ---------- actions ----------
  async function updateSession(key: string, patch: Partial<ScheduleRow>) {
    setBusy(true);
    const { error } = await supabase.from("schedules").update(patch).eq("session_key", key);
    setBusy(false);
    if (error) { alert("บันทึกไม่สำเร็จ: " + error.message); return false; }
    await loadRows();
    return true;
  }

  async function handleDrop(key: string, day: number, period: number) {
    const s = toSessions(rows.filter((r) => r.session_key === key))[0];
    if (!s) return;
    const len = s.end - s.start;
    const idx = config.periods.findIndex((p) => p.no === period);
    const endP = config.periods[idx + len];
    if (!endP) return alert("วางไม่ได้: เกินคาบสุดท้ายของวัน");
    const span = config.periods.slice(idx, idx + len + 1).map((p) => p.no);
    if (config.blocked.some((b) => b.day === day && b.periods.some((p) => span.includes(p)))) {
      return alert("วางไม่ได้: ทับช่วงเวลาที่ห้ามจัด");
    }
    const t = teachers.find((x) => x.id === s.rows[0].teacher_id);
    const unavailable = (t?.unavailable_times ?? []).some((u) => u.day === day && u.periods.some((p) => span.includes(p)));
    const msgs = conflictsForMove(rows, key, day, period, endP.no, s.rows[0].room_id);
    if (unavailable) msgs.unshift(`ครู ${t?.name} ระบุว่าไม่สะดวกสอนช่วงนี้`);
    if (msgs.length && !confirm(`พบปัญหา:\n- ${msgs.join("\n- ")}\n\nยืนยันการย้ายหรือไม่?`)) return;
    const ok = await updateSession(key, { day_of_week: day, start_period: period, end_period: endP.no, is_locked: true });
    if (ok) setNotice(`ย้ายไป ${DAY_NAMES[day]} คาบ ${period}-${endP.no} และล็อกคาบนี้แล้ว`);
  }

  async function changeRoom(s: Session, roomId: string) {
    const msgs = conflictsForMove(rows, s.key, s.day, s.start, s.end, roomId).filter((m) => m.startsWith("ห้อง"));
    const room = rooms.find((r) => r.id === roomId);
    const students = s.rows.reduce((a, r) => a + (r.student_count ?? 0), 0);
    if (room && room.capacity < students) msgs.push(`ห้องจุได้ ${room.capacity} คน แต่มีนักเรียน ${students} คน`);
    if (msgs.length && !confirm(`พบปัญหา:\n- ${msgs.join("\n- ")}\n\nยืนยันหรือไม่?`)) return;
    if (await updateSession(s.key, { room_id: roomId || null, is_locked: true })) setSelected(null);
  }

  async function deleteSession(s: Session) {
    if (!confirm("ลบคาบนี้ออกจากตาราง?")) return;
    const { error } = await supabase.from("schedules").delete().eq("session_key", s.key);
    if (error) alert(error.message);
    setSelected(null);
    loadRows();
  }

  async function setStatus(status: "draft" | "published") {
    if (status === "published" && conflicts.length && !confirm(`ยังมีการชนกัน ${conflicts.length} จุด ยืนยันเผยแพร่?`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("set_schedule_status", { p_semester: semesterId, p_status: status });
    setBusy(false);
    if (error) return alert(error.message);
    setNotice(status === "published" ? `เผยแพร่แล้ว ${data} คาบ — ครูและนักเรียนมองเห็นตารางได้` : "เปลี่ยนเป็นฉบับร่างแล้ว");
    loadRows();
  }

  async function exportExcel(all: boolean) {
    setBusy(true);
    try {
      const list = all ? targets : targets.filter((t) => t.id === targetId);
      const sheets: SheetSpec[] = list.map((t): SheetSpec => {
        const keys = new Set(rows.filter((r) => matchRow(r, mode, t.id)).map((r) => r.session_key));
        return {
          title: t.label.split(" — ")[0],
          subtitle: `${MODE_LABEL[mode]}: ${t.label}`,
          rows: rows.filter((r) => keys.has(r.session_key)),
          cellText: (rs) => {
            const r = rs[0];
            const g = Array.from(new Set(rs.map((x) => x.group_code))).join(", ");
            const extra = mode === "group" ? r.teacher_name : mode === "teacher" ? g : `${g} / ${r.teacher_name}`;
            return `${r.subject_code}\n${r.subject_name}\n${extra}\n${mode === "room" ? "" : r.room_code ?? ""}`;
          },
        };
      }).filter((s) => s.rows.length > 0 || !all);
      const buf = await buildWorkbook(config, sheets,
        `วิทยาลัยการอาชีพโพนทอง — ${MODE_LABEL[mode]} ภาคเรียนที่ ${semester?.name ?? ""}`);
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const filename = `timetable_${mode}_${(semester?.name ?? "").replace("/", "-")}${all ? "_all" : ""}.xlsx`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      if (isAdmin) {
        await supabase.storage.from("exports").upload(`${semester?.name.replace("/", "-")}/${Date.now()}-${filename}`, blob);
      }
    } finally {
      setBusy(false);
    }
  }

  const selRow = selected?.rows[0];
  const target = targets.find((t) => t.id === targetId);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end gap-3">
        <div>
          <label className="label">ภาคเรียน</label>
          <select className="input w-36" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
            {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">มุมมอง</label>
          <select className="input w-48" value={mode} onChange={(e) => { setMode(e.target.value as ViewMode); setSelected(null); }}>
            {(Object.keys(MODE_LABEL) as ViewMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
        </div>
        <div className="min-w-[260px] flex-1">
          <label className="label">เลือก</label>
          <select className="input" value={targetId} onChange={(e) => { setTargetId(e.target.value); setSelected(null); }}>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => exportExcel(false)}>ส่งออก Excel</button>
          <button className="btn-secondary" disabled={busy} onClick={() => exportExcel(true)}>Excel ทุก{mode === "group" ? "กลุ่ม" : mode === "teacher" ? "ครู" : "ห้อง"}</button>
          <button className="btn-secondary" onClick={() => window.print()}>พิมพ์ / PDF</button>
        </div>
      </div>

      {isAdmin && (
        <div className="no-print card flex flex-wrap items-center gap-3 text-sm">
          <span>ฉบับร่าง <b>{stats.draft}</b> | เผยแพร่แล้ว <b>{stats.published}</b></span>
          <span className={conflicts.length ? "font-semibold text-red-600" : "text-green-700"}>
            {conflicts.length ? `⚠ พบการชนกัน ${conflicts.length} จุด` : "✓ ไม่มีการชนกัน"}
          </span>
          <span className="text-slate-500">ลากการ์ดวิชาไปวางช่องอื่นเพื่อย้าย (คาบที่ย้ายด้วยมือจะถูกล็อกอัตโนมัติ)</span>
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary" disabled={busy} onClick={() => setStatus("draft")}>ยกเลิกเผยแพร่</button>
            <button className="btn-primary" disabled={busy || rows.length === 0} onClick={() => setStatus("published")}>เผยแพร่ตาราง</button>
          </div>
        </div>
      )}
      {notice && <div className="no-print rounded bg-brand-50 p-2 text-sm text-brand-900">{notice}</div>}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="card print-area min-w-0 flex-1">
          <div className="mb-3 text-center">
            <h2 className="text-lg font-bold">วิทยาลัยการอาชีพโพนทอง — {MODE_LABEL[mode]}</h2>
            <p className="text-sm text-slate-600">{target?.label} | ภาคเรียนที่ {semester?.name}</p>
          </div>
          {rows.length === 0 ? (
            <p className="p-8 text-center text-slate-400">
              {isAdmin ? "ยังไม่มีตาราง — ไปที่เมนู “จัดตารางอัตโนมัติ (AI)”" : "ยังไม่มีตารางที่เผยแพร่"}
            </p>
          ) : (
            <TimetableGrid config={config} sessions={viewSessions} mode={mode} editable={isAdmin && !busy}
              conflictKeys={conflictKeys} selectedKey={selected?.key ?? null} onSelect={setSelected} onDrop={handleDrop} />
          )}
          {summary.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead><tr><th className="th">รหัสวิชา</th><th className="th">ชื่อวิชา</th><th className="th">{mode === "group" ? "ครูผู้สอน" : "กลุ่มเรียน"}</th><th className="th text-right">คาบ/สัปดาห์</th></tr></thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.code + s.who}><td className="td">{s.code}</td><td className="td">{s.name}</td><td className="td">{s.who}</td><td className="td text-right">{s.hours}</td></tr>
                ))}
                <tr><td className="td font-semibold" colSpan={3}>รวม</td><td className="td text-right font-semibold">{summary.reduce((a, s) => a + s.hours, 0)}</td></tr>
              </tbody>
            </table>
          )}
        </div>

        {(selected || (isAdmin && conflicts.length > 0)) && (
          <div className="no-print w-full space-y-4 xl:w-80">
            {selected && selRow && (
              <div className="card space-y-2 text-sm">
                <div className="flex justify-between">
                  <h3 className="font-semibold">{selRow.subject_code}</h3>
                  <button onClick={() => setSelected(null)}>✕</button>
                </div>
                <p>{selRow.subject_name}</p>
                <p>ครู: {selRow.teacher_name}</p>
                <p>กลุ่ม: {Array.from(new Set(selected.rows.map((r) => r.group_code))).join(", ")}</p>
                <p>เวลา: {DAY_NAMES[selected.day]} คาบ {selected.start}-{selected.end}</p>
                <p>ต้องการห้อง: {roomTypeLabel(selRow.required_room_type)}</p>
                {isAdmin ? (
                  <>
                    <label className="label mt-2">ห้องเรียน</label>
                    <select className="input" value={selRow.room_id ?? ""} disabled={busy} onChange={(e) => changeRoom(selected, e.target.value)}>
                      <option value="">— ไม่ระบุ —</option>
                      {[...rooms].sort((a, b) => Number(b.room_type === selRow.required_room_type) - Number(a.room_type === selRow.required_room_type))
                        .map((r) => <option key={r.id} value={r.id}>{r.room_code} {r.room_name} ({r.capacity}){r.room_type === selRow.required_room_type ? " ✓" : ""}</option>)}
                    </select>
                    <div className="flex gap-2 pt-2">
                      <button className="btn-secondary flex-1" disabled={busy}
                        onClick={async () => { await updateSession(selected.key, { is_locked: !selRow.is_locked }); setSelected(null); }}>
                        {selRow.is_locked ? "ปลดล็อก" : "ล็อกคาบนี้"}
                      </button>
                      <button className="btn-danger" disabled={busy} onClick={() => deleteSession(selected)}>ลบ</button>
                    </div>
                  </>
                ) : (
                  <p>ห้อง: {selRow.room_code} {selRow.room_name}</p>
                )}
              </div>
            )}
            {isAdmin && conflicts.length > 0 && (
              <div className="card max-h-96 overflow-y-auto text-sm">
                <h3 className="mb-2 font-semibold text-red-600">รายการชนกัน</h3>
                <ul className="space-y-1">
                  {conflicts.slice(0, 100).map((c, i) => (
                    <li key={i}>• {c.label} — {DAY_NAMES[c.day]} คาบ {c.period}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
