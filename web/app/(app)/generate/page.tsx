"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminOnly } from "@/components/ProfileProvider";
import { ENGINE_URL } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { ScheduleJob, Semester } from "@/lib/types";

const STATUS_TH: Record<ScheduleJob["status"], string> = {
  queued: "อยู่ในคิว", running: "กำลังคำนวณ", succeeded: "สำเร็จ", failed: "ไม่สำเร็จ",
};

export default function GeneratePage() {
  const supabase = createClient();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [semesterId, setSemesterId] = useState("");
  const [timeLimit, setTimeLimit] = useState(60);
  const [jobs, setJobs] = useState<ScheduleJob[]>([]);
  const [current, setCurrent] = useState<ScheduleJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockedCount, setLockedCount] = useState(0);

  const loadJobs = useCallback(async (sid: string) => {
    const { data } = await supabase.from("schedule_jobs").select("*").eq("semester_id", sid)
      .order("created_at", { ascending: false }).limit(10);
    setJobs(data ?? []);
    const running = (data ?? []).find((j: ScheduleJob) => j.status === "queued" || j.status === "running");
    if (running) setCurrent(running);
    const { count } = await supabase.from("schedules").select("id", { count: "exact", head: true })
      .eq("semester_id", sid).eq("is_locked", true);
    setLockedCount(count ?? 0);
  }, [supabase]);

  useEffect(() => {
    supabase.from("semesters").select("*").order("academic_year", { ascending: false }).then(({ data }) => {
      setSemesters(data ?? []);
      const act = (data ?? []).find((s: Semester) => s.is_active) ?? data?.[0];
      if (act) setSemesterId(act.id);
    });
  }, [supabase]);

  useEffect(() => { if (semesterId) loadJobs(semesterId); }, [semesterId, loadJobs]);

  // Supabase Realtime : ฟังการเปลี่ยนแปลงของงานที่กำลังทำ
  useEffect(() => {
    if (!current?.id) return;
    const channel = supabase
      .channel(`job-${current.id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "schedule_jobs", filter: `id=eq.${current.id}` },
        (payload) => {
          const j = payload.new as ScheduleJob;
          setCurrent(j);
          if (j.status === "succeeded" || j.status === "failed") loadJobs(j.semester_id);
        })
      .subscribe();
    // สำรอง: กรณี Realtime ไม่ได้เปิด จะ poll ทุก 3 วินาที
    const poll = setInterval(async () => {
      const { data } = await supabase.from("schedule_jobs").select("*").eq("id", current.id).single();
      if (data) {
        setCurrent(data);
        if (data.status === "succeeded" || data.status === "failed") {
          clearInterval(poll);
          loadJobs(data.semester_id);
        }
      }
    }, 3000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  async function start() {
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setError("กรุณาเข้าสู่ระบบใหม่");
    if (!confirm("ระบบจะลบตารางฉบับร่างที่ไม่ได้ล็อกของภาคเรียนนี้ และจัดใหม่ทั้งหมด ยืนยัน?")) return;
    try {
      const res = await fetch(`${ENGINE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ semester_id: semesterId, time_limit_seconds: timeLimit }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? `HTTP ${res.status}`);
      setCurrent({ id: body.job_id, semester_id: semesterId, status: "queued", progress: 0, message: "อยู่ในคิว",
        result: null, created_at: new Date().toISOString(), finished_at: null });
    } catch (e) {
      setError(`เรียก AI Engine ไม่สำเร็จ (${ENGINE_URL}): ${(e as Error).message}`);
    }
  }

  const running = current && (current.status === "queued" || current.status === "running");
  const result = current?.result as { errors?: string[]; warnings?: string[]; blocks?: number; wall_time?: number } | null;

  return (
    <AdminOnly>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">จัดตารางอัตโนมัติ (AI Scheduling Engine)</h1>

        <div className="card grid gap-4 md:grid-cols-4 md:items-end">
          <div>
            <label className="label">ภาคเรียน</label>
            <select className="input" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
              {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active ? " (ปัจจุบัน)" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="label">เวลาคำนวณสูงสุด (วินาที)</label>
            <input type="number" className="input" min={5} max={600} value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))} />
          </div>
          <div className="text-sm text-slate-500">คาบที่ล็อกไว้ (จะไม่ถูกย้าย): <b>{lockedCount}</b></div>
          <button className="btn-primary" disabled={!semesterId || !!running} onClick={start}>
            {running ? "กำลังคำนวณ..." : "▶ เริ่มจัดตาราง"}
          </button>
        </div>

        {error && <div className="card border-red-300 bg-red-50 text-sm text-red-700">{error}</div>}

        {current && (
          <div className="card space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span><b>{STATUS_TH[current.status]}</b> — {current.message}</span>
              <span className="font-mono">{current.progress}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div className={`h-full transition-all duration-500 ${current.status === "failed" ? "bg-red-500" : current.status === "succeeded" ? "bg-green-500" : "bg-brand-500"}`}
                style={{ width: `${current.progress}%` }} />
            </div>
            {current.status === "succeeded" && (
              <p className="text-sm text-green-700">
                จัดได้ {result?.blocks} ก้อนคาบเรียน ใช้เวลา {result?.wall_time} วินาที —{" "}
                <Link href="/timetable" className="underline">ดูตาราง</Link>
              </p>
            )}
            {result?.errors && result.errors.length > 0 && (
              <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                <p className="font-semibold">ปัญหาที่พบ:</p>
                <ul className="list-disc pl-5">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
            {result?.warnings && result.warnings.length > 0 && (
              <div className="rounded bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-semibold">คำเตือน:</p>
                <ul className="list-disc pl-5">{result.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        <div className="card p-0">
          <h2 className="p-4 font-semibold">ประวัติการจัดตาราง</h2>
          <table className="w-full">
            <thead><tr><th className="th">เวลา</th><th className="th">สถานะ</th><th className="th">ความคืบหน้า</th><th className="th">ข้อความ</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="td">{new Date(j.created_at).toLocaleString("th-TH")}</td>
                  <td className="td">{STATUS_TH[j.status]}</td>
                  <td className="td">{j.progress}%</td>
                  <td className="td text-xs">{j.message}</td>
                </tr>
              ))}
              {jobs.length === 0 && <tr><td className="td text-center text-slate-400" colSpan={4}>ยังไม่มีประวัติ</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AdminOnly>
  );
}
