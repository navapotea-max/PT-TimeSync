"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { AdminOnly } from "@/components/ProfileProvider";
import { ENGINE_URL } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { ScheduleJob, Semester } from "@/lib/types";

const STATUS_TH: Record<ScheduleJob["status"], string> = {
  queued: "อยู่ในคิว", running: "กำลังประมวลผล", succeeded: "เสร็จสมบูรณ์", failed: "ไม่สำเร็จ",
};
const STATUS_CHIP: Record<ScheduleJob["status"], string> = {
  queued: "chip-gray", running: "chip-blue", succeeded: "chip-green", failed: "chip-red",
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
    // แสดงงานที่กำลังทำ หรือผลของงานล่าสุด
    setCurrent((prev) => running ?? (prev && prev.semester_id === sid ? prev : data?.[0] ?? null));
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
      <div className="space-y-5">
        <PageHeader title="ประมวลผลจัดตารางสอนอัตโนมัติ"
          subtitle="ระบบคำนวณการจัดวางคาบเรียนตามภาระงานสอน ประเภทห้องเรียน และเวลาที่ครูสะดวกโดยไม่ให้เกิดการชนกัน" />

        <div className="card grid gap-4 md:grid-cols-2 md:items-end xl:grid-cols-4">
          <div>
            <label className="label">ภาคเรียนที่ต้องการจัด</label>
            <select className="input" value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
              {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active ? " (ปัจจุบัน)" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="label">เวลาประมวลผลสูงสุด (วินาที)</label>
            <input type="number" className="input font-mono" min={5} max={600} value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))} />
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
            คาบที่ล็อกตำแหน่งไว้ (ไม่ถูกย้าย): <b className="font-mono text-slate-900 dark:text-white">{lockedCount}</b> คาบ
          </div>
          <button className="btn-primary py-2.5" disabled={!semesterId || !!running} onClick={start}>
            {running ? "กำลังประมวลผล..." : "เริ่มคำนวณตารางสอน"}
          </button>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30">{error}</div>}

        {current && (
          <div className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span className={STATUS_CHIP[current.status]}>{STATUS_TH[current.status]}</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">{current.message}</span>
              </span>
              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{current.progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={`h-full rounded-full transition-all duration-500 ${current.status === "failed" ? "bg-red-500" : "bg-brand-600 dark:bg-brand-500"} ${running ? "animate-pulse" : ""}`}
                style={{ width: `${current.progress}%` }} />
            </div>
            {current.status === "succeeded" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                <span>จัดตารางสำเร็จ {result?.blocks} ก้อนคาบเรียน (ใช้เวลา {result?.wall_time} วินาที)</span>
                <Link href="/timetable" className="font-semibold underline">เปิดดูตารางเรียนที่จัดเสร็จแล้ว →</Link>
              </div>
            )}
            {result?.errors && result.errors.length > 0 && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                <p className="mb-1 font-semibold">ปัญหาที่พบ</p>
                <ul className="list-disc space-y-0.5 pl-5">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
            {result?.warnings && result.warnings.length > 0 && (
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="mb-1 font-semibold">คำเตือน</p>
                <ul className="list-disc space-y-0.5 pl-5">{result.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        <div className="card overflow-hidden p-0">
          <h2 className="card-title px-5 py-4">ประวัติการประมวลผล</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">วันและเวลา</th><th className="th">สถานะ</th><th className="th">ความคืบหน้า</th><th className="th">รายละเอียด</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="td whitespace-nowrap font-mono text-xs">{new Date(j.created_at).toLocaleString("th-TH")}</td>
                    <td className="td"><span className={STATUS_CHIP[j.status]}>{STATUS_TH[j.status]}</span></td>
                    <td className="td font-mono text-xs">{j.progress}%</td>
                    <td className="td text-xs text-slate-500 dark:text-slate-400">{j.message}</td>
                  </tr>
                ))}
                {jobs.length === 0 && <tr><td className="td text-center text-slate-400" colSpan={4}>ยังไม่มีประวัติ</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminOnly>
  );
}
