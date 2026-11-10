"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { usePrivacy } from "@/components/Preferences";
import { DAY_DOT } from "@/components/TimetableGrid";
import { useProfile } from "@/components/ProfileProvider";
import { configOf, DAY_NAMES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Semester, Teacher } from "@/lib/types";

type Times = { day: number; periods: number[] }[];

export default function AvailabilityPage() {
  const supabase = createClient();
  const profile = useProfile();
  const privacy = usePrivacy();
  const isAdmin = profile.role === "admin";
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [cells, setCells] = useState<Set<string>>(new Set());
  const [semester, setSemester] = useState<Semester | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const config = configOf(semester);

  useEffect(() => {
    (async () => {
      const { data: sem } = await supabase.from("semesters").select("*").eq("is_active", true).maybeSingle();
      setSemester(sem);
      const { data } = await supabase.from("teachers").select("id,user_id,teacher_code,name,unavailable_times").order("teacher_code");
      const list = (data ?? []) as Teacher[];
      setTeachers(isAdmin ? list : list.filter((t) => t.user_id === profile.id));
      const first = isAdmin ? list[0] : list.find((t) => t.user_id === profile.id);
      if (first) setTeacherId(first.id);
    })();
  }, [supabase, isAdmin, profile.id]);

  useEffect(() => {
    const t = teachers.find((x) => x.id === teacherId);
    const s = new Set<string>();
    (t?.unavailable_times ?? []).forEach((u) => u.periods.forEach((p) => s.add(`${u.day}|${p}`)));
    setCells(s);
    setMsg(null);
  }, [teacherId, teachers]);

  function toggle(k: string) {
    const s = new Set(cells);
    if (s.has(k)) s.delete(k); else s.add(k);
    setCells(s);
  }

  async function save() {
    const byDay = new Map<number, number[]>();
    cells.forEach((k) => {
      const [d, p] = k.split("|").map(Number);
      byDay.set(d, [...(byDay.get(d) ?? []), p].sort((a, b) => a - b));
    });
    const times: Times = Array.from(byDay.entries()).sort((a, b) => a[0] - b[0]).map(([day, periods]) => ({ day, periods }));
    const t = teachers.find((x) => x.id === teacherId);
    const { error } = isAdmin && t?.user_id !== profile.id
      ? await supabase.from("teachers").update({ unavailable_times: times }).eq("id", teacherId)
      : await supabase.rpc("set_my_unavailable_times", { times });
    if (error) setMsg("บันทึกไม่สำเร็จ: " + error.message);
    else {
      setMsg("บันทึกแล้ว — จะมีผลเมื่อสั่งจัดตารางครั้งถัดไป");
      setTeachers(teachers.map((x) => (x.id === teacherId ? { ...x, unavailable_times: times } : x)));
    }
  }

  if (!teachers.length) {
    return (
      <div className="space-y-5">
        <PageHeader title="กำหนดเวลาที่ไม่สะดวกสอน" />
        <div className="card text-sm text-slate-500 dark:text-slate-400">
          บัญชีนี้ยังไม่ได้ผูกกับข้อมูลครู — ให้ผู้ดูแลระบบใส่อีเมลของท่านในข้อมูลครู หรือผูกบัญชีที่เมนู “ผู้ใช้งานและสิทธิ์”
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="กำหนดเวลาที่ไม่สะดวกสอน"
        subtitle={`คลิกที่ช่องตารางเพื่อระบุคาบที่ติดภารกิจหรือราชการ (เลือกไว้ ${cells.size} คาบ)`} />
      <div className="card space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full max-w-sm">
            <label className="label">ครูผู้สอน</label>
            <select className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={!isAdmin}>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.teacher_code} — {privacy.name(t.name)}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setCells(new Set())}>ล้างทั้งหมด</button>
            <button className="btn-primary" onClick={save}>บันทึกการตั้งค่า</button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="th w-32">วัน / คาบ</th>
                {config.periods.map((p) => (
                  <th key={p.no} className="th text-center">
                    <div className="text-slate-700 dark:text-slate-200">คาบ {p.no}</div>
                    {p.start && <div className="font-mono text-[10px] font-normal text-slate-400">{p.start}-{p.end}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.days.map((d) => (
                <tr key={d}>
                  <td className="td font-semibold">
                    <span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${DAY_DOT[d]}`} />{DAY_NAMES[d]}</span>
                  </td>
                  {config.periods.map((p) => {
                    const k = `${d}|${p.no}`;
                    const on = cells.has(k);
                    return (
                      <td key={k} onClick={() => toggle(k)} role="button" aria-pressed={on}
                        className={`h-14 cursor-pointer select-none border-b border-l border-slate-100 text-center transition dark:border-slate-800 ${on
                          ? "bg-red-50/70 dark:bg-red-500/10"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}>
                        {on
                          ? <span className="chip-red">ไม่สะดวก</span>
                          : <span className="text-[11px] text-slate-300 dark:text-slate-600">ว่าง</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {msg && <p className="text-sm text-brand-700 dark:text-brand-300">{msg}</p>}
      </div>
    </div>
  );
}
