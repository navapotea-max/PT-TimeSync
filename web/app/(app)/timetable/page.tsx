"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconDownload, IconLock, IconPrinter, IconX } from "@/components/Icons";
import Logo from "@/components/Logo";
import TimetableGrid, { DAY_DOT, toSessions, type Session, type ViewMode } from "@/components/TimetableGrid";
import { usePrivacy } from "@/components/Preferences";
import { useProfile, useViewAs } from "@/components/ProfileProvider";
import { conflictsForMove, findConflicts } from "@/lib/conflicts";
import { configOf, DAY_NAMES, roomTypeLabel } from "@/lib/constants";
import { buildWorkbook, type SheetSpec } from "@/lib/exportExcel";
import { createClient } from "@/lib/supabase/client";
import type { Room, ScheduleRow, Semester, StudentGroup, Teacher } from "@/lib/types";

const MODE_LABEL: Record<ViewMode, string> = { group: "ตารางเรียน (กลุ่มเรียน)", teacher: "ตารางสอน (ครูผู้สอน)", room: "ตารางการใช้ห้องเรียน" };
const MODE_TAB: Record<ViewMode, string> = { group: "กลุ่มเรียน", teacher: "ครูผู้สอน", room: "ห้องเรียน" };

export default function TimetablePage() {
  const supabase = createClient();
  const profile = useProfile();
  const privacy = usePrivacy();
  const { simulating } = useViewAs();
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
        const me = (tc.data ?? []).find((t: Teacher) => (profile.teacher_id ? t.id === profile.teacher_id : t.user_id === profile.id));
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
    // จำลองมุมมองครู/นักเรียน: แสดงเฉพาะตารางที่เผยแพร่แล้ว เหมือนที่ผู้ใช้จริงเห็น
    setRows(simulating ? all.filter((r) => r.status === "published") : all);
  }, [supabase, semesterId, simulating]);

  useEffect(() => { loadRows(); }, [loadRows]);

  // ---------- derived ----------
  const targets = useMemo(() => {
    if (mode === "group") return groups.map((g) => ({ id: g.id, label: `${g.group_code} — ${g.group_name}` }));
    if (mode === "teacher") return teachers.map((t) => ({ id: t.id, label: `${t.teacher_code} — ${privacy.name(t.name)}` }));
    return rooms.map((r) => ({ id: r.id, label: `${r.room_code} — ${r.room_name}` }));
  }, [mode, groups, teachers, rooms, privacy]);

  useEffect(() => {
    if (targets.length && !targets.some((t) => t.id === targetId)) setTargetId(targets[0].id);
  }, [targets, targetId]);

  const matchRow = useCallback((r: ScheduleRow, m: ViewMode, id: string) =>
    m === "group" ? r.student_group_id === id : m === "teacher" ? r.teacher_id === id : r.room_id === id, []);

  const viewSessions = useMemo(() => {
    const keys = new Set(rows.filter((r) => matchRow(r, mode, targetId)).map((r) => r.session_key));
    return toSessions(rows.filter((r) => keys.has(r.session_key)));
  }, [rows, mode, targetId, matchRow]);

  const conflicts = useMemo(() => findConflicts(rows, privacy.name), [rows, privacy]);
  const conflictKeys = useMemo(() => new Set(conflicts.flatMap((c) => c.sessionKeys)), [conflicts]);
  const stats = useMemo(() => ({
    draft: rows.filter((r) => r.status === "draft").length,
    published: rows.filter((r) => r.status === "published").length,
  }), [rows]);

  const summary = useMemo(() => {
    const m = new Map<string, { code: string; name: string; who: string; rooms: Set<string>; hours: number; blocks: number }>();
    viewSessions.forEach((s) => {
      const r = s.rows[0];
      const who = mode === "group" ? privacy.name(r.teacher_name) : Array.from(new Set(s.rows.map((x) => x.group_code))).join(", ");
      const k = `${r.subject_code}|${who}`;
      const e = m.get(k) ?? { code: r.subject_code, name: r.subject_name, who, rooms: new Set<string>(), hours: 0, blocks: 0 };
      e.hours += s.end - s.start + 1;
      e.blocks += 1;
      if (r.room_code) e.rooms.add(r.room_code);
      m.set(k, e);
    });
    return Array.from(m.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [viewSessions, mode, privacy]);
  const totalHours = summary.reduce((a, s) => a + s.hours, 0);

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
            const tn = privacy.name(r.teacher_name);
            const extra = mode === "group" ? tn : mode === "teacher" ? g : `${g} / ${tn}`;
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
  const whoHeader = mode === "group" ? "ครูผู้สอน" : "กลุ่มเรียน";

  return (
    <div className="space-y-5">
      {/* ---------- ตัวกรอง ---------- */}
      <div className="no-print card flex flex-wrap items-end gap-4 p-4">
        <div>
          <label className="label">ภาคเรียน</label>
          <select className="input w-32" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
            {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">มุมมองตาราง</label>
          <div className="seg">
            {(Object.keys(MODE_TAB) as ViewMode[]).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setSelected(null); }}
                className={`seg-btn ${mode === m ? "seg-btn-active" : ""}`}>{MODE_TAB[m]}</button>
            ))}
          </div>
        </div>
        <div className="min-w-[240px] flex-1">
          <label className="label">เลือกรายการ</label>
          <select className="input" value={targetId} onChange={(e) => { setTargetId(e.target.value); setSelected(null); }}>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => exportExcel(false)}>
            <IconDownload className="h-3.5 w-3.5" />ส่งออก Excel
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => exportExcel(true)}>
            Excel ทุก{MODE_TAB[mode]}
          </button>
          <button className="btn-secondary" onClick={() => window.print()}>
            <IconPrinter className="h-3.5 w-3.5" />พิมพ์ / PDF
          </button>
        </div>
      </div>

      {/* ---------- แถบสถานะ (ผู้ดูแลระบบ) ---------- */}
      {isAdmin && (
        <div className="no-print card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-xs">
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="h-2 w-2 rounded-full bg-amber-400" />ฉบับร่าง <b className="font-mono">{stats.draft}</b>
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="h-2 w-2 rounded-full bg-brand-500" />เผยแพร่แล้ว <b className="font-mono">{stats.published}</b>
          </span>
          <span className="hidden h-4 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
          {conflicts.length
            ? <span className="chip-red">พบคาบชนกัน {conflicts.length} จุด</span>
            : <span className="chip-green">ไม่พบคาบเรียนชนกัน</span>}
          <span className="text-slate-400">• ลากการ์ดวิชาไปวางในช่องว่างเพื่อย้ายคาบ หรือคลิกที่การ์ดเพื่อเปลี่ยนห้องเรียนและล็อกตำแหน่ง</span>
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary btn-sm" disabled={busy} onClick={() => setStatus("draft")}>เปลี่ยนเป็นฉบับร่าง</button>
            <button className="btn-primary btn-sm" disabled={busy || rows.length === 0} onClick={() => setStatus("published")}>เผยแพร่ตารางเรียน</button>
          </div>
        </div>
      )}
      {notice && (
        <div className="no-print flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-800 dark:border-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="ปิด"><IconX className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="flex flex-col gap-5 xl:flex-row">
        {/* ---------- ตาราง ---------- */}
        <div className="card print-area min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Logo size={48} className="ring-1 ring-slate-200 dark:ring-slate-700" />
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">วิทยาลัยการอาชีพโพนทอง — {MODE_LABEL[mode]}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{target?.label} · ภาคเรียนที่ {semester?.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">รวม <span className="font-mono">{totalHours}</span> คาบ/สัปดาห์</p>
              <p className="text-[11px] text-slate-400">{viewSessions.length} ก้อนคาบเรียน</p>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400 dark:border-slate-700">
              {isAdmin ? "ยังไม่มีตาราง — ไปที่เมนู “ประมวลผลจัดตารางสอน”" : "ยังไม่มีตารางที่เผยแพร่"}
            </div>
          ) : (
            <TimetableGrid config={config} sessions={viewSessions} mode={mode} editable={isAdmin && !busy}
              conflictKeys={conflictKeys} selectedKey={selected?.key ?? null} onSelect={setSelected} onDrop={handleDrop} />
          )}

          {summary.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">รหัสวิชา</th><th className="th">ชื่อรายวิชา</th><th className="th">{whoHeader}</th>
                    {mode !== "room" && <th className="th">ห้องเรียน</th>}
                    <th className="th text-right">จำนวนคาบ</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.code + s.who}>
                      <td className="td font-mono text-xs font-semibold text-slate-900 dark:text-white">{s.code}</td>
                      <td className="td">{s.name}</td>
                      <td className="td text-slate-500 dark:text-slate-400">{s.who}</td>
                      {mode !== "room" && <td className="td font-mono text-xs text-slate-500 dark:text-slate-400">{Array.from(s.rooms).join(", ") || "-"}</td>}
                      <td className="td text-right font-mono tabular-nums">{s.hours}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="td font-semibold text-slate-900 dark:text-white" colSpan={mode !== "room" ? 4 : 3}>รวมจำนวนคาบทั้งหมด</td>
                    <td className="td text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">{totalHours}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ---------- แผงรายละเอียด ---------- */}
        {(selected || (isAdmin && conflicts.length > 0)) && (
          <div className="no-print w-full space-y-4 xl:w-80">
            {selected && selRow && (
              <div className="card space-y-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-brand-600 dark:text-brand-400">{selRow.subject_code}</p>
                    <h3 className="font-semibold text-slate-900 dark:text-white">{selRow.subject_name}</h3>
                  </div>
                  <button className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" onClick={() => setSelected(null)} aria-label="ปิด">
                    <IconX />
                  </button>
                </div>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2"><dt className="text-slate-400">ครูผู้สอน</dt><dd className="text-right text-slate-700 dark:text-slate-200">{privacy.name(selRow.teacher_name)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-400">กลุ่มเรียน</dt><dd className="text-right text-slate-700 dark:text-slate-200">{Array.from(new Set(selected.rows.map((r) => r.group_code))).join(", ")}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-400">เวลา</dt><dd className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200"><span className={`h-2 w-2 rounded-full ${DAY_DOT[selected.day]}`} />{DAY_NAMES[selected.day]} คาบ {selected.start}–{selected.end}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-400">ประเภทห้องที่ต้องใช้</dt><dd className="text-right text-slate-700 dark:text-slate-200">{roomTypeLabel(selRow.required_room_type)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-400">สถานะ</dt><dd>{selRow.status === "published" ? <span className="chip-green">เผยแพร่แล้ว</span> : <span className="chip-amber">ฉบับร่าง</span>}</dd></div>
                </dl>
                {isAdmin ? (
                  <>
                    <div>
                      <label className="label">ห้องเรียน</label>
                      <select className="input" value={selRow.room_id ?? ""} disabled={busy} onChange={(e) => changeRoom(selected, e.target.value)}>
                        <option value="">— ไม่ระบุ —</option>
                        {[...rooms].sort((a, b) => Number(b.room_type === selRow.required_room_type) - Number(a.room_type === selRow.required_room_type))
                          .map((r) => <option key={r.id} value={r.id}>{r.room_code} {r.room_name} ({r.capacity}){r.room_type === selRow.required_room_type ? " ✓" : ""}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-secondary flex-1" disabled={busy}
                        onClick={async () => { await updateSession(selected.key, { is_locked: !selRow.is_locked }); setSelected(null); }}>
                        <IconLock className="h-3.5 w-3.5" />{selRow.is_locked ? "ปลดล็อก" : "ล็อกตำแหน่ง"}
                      </button>
                      <button className="btn-danger" disabled={busy} onClick={() => deleteSession(selected)}>ลบคาบ</button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">ห้อง: <span className="font-mono">{selRow.room_code}</span> {selRow.room_name}</p>
                )}
              </div>
            )}
            {isAdmin && conflicts.length > 0 && (
              <div className="card max-h-96 overflow-y-auto text-sm">
                <h3 className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">รายการคาบชนกัน</h3>
                <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {conflicts.slice(0, 100).map((c, i) => (
                    <li key={i} className="flex gap-1.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />{c.label} — {DAY_NAMES[c.day]} คาบ {c.period}</li>
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
