"use client";

import { useEffect, useState } from "react";
import { useProfile } from "@/components/ProfileProvider";
import { configOf, DAY_NAMES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Semester, Teacher } from "@/lib/types";

type Times = { day: number; periods: number[] }[];

export default function AvailabilityPage() {
  const supabase = createClient();
  const profile = useProfile();
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
    return <div className="card text-slate-500">บัญชีนี้ยังไม่ได้ผูกกับข้อมูลครู (ให้ผู้ดูแลระบบใส่อีเมลของท่านในข้อมูลครู หรือผูกที่เมนูจัดการผู้ใช้)</div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">เวลาที่ไม่สะดวกสอน</h1>
      <div className="card space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px]">
            <label className="label">ครูผู้สอน</label>
            <select className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} disabled={!isAdmin}>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.teacher_code} — {t.name}</option>)}
            </select>
          </div>
          <p className="text-sm text-slate-500">คลิกช่องเพื่อทำเครื่องหมาย ✕ = ไม่สะดวกสอน</p>
          <button className="btn-primary ml-auto" onClick={save}>บันทึก</button>
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-100 p-2">วัน</th>
                {config.periods.map((p) => (
                  <th key={p.no} className="border border-slate-300 bg-slate-100 p-2">
                    {p.no}<div className="text-[10px] font-normal text-slate-500">{p.start}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config.days.map((d) => (
                <tr key={d}>
                  <td className="border border-slate-300 p-2 font-medium">{DAY_NAMES[d]}</td>
                  {config.periods.map((p) => {
                    const k = `${d}|${p.no}`;
                    const on = cells.has(k);
                    return (
                      <td key={k} onClick={() => toggle(k)}
                        className={`h-12 w-16 cursor-pointer border border-slate-300 text-center text-lg ${on ? "bg-red-100 text-red-600" : "hover:bg-slate-50"}`}>
                        {on ? "✕" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {msg && <p className="text-sm text-brand-700">{msg}</p>}
      </div>
    </div>
  );
}
