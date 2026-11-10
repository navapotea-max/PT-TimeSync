"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { usePrivacy } from "@/components/Preferences";
import { useProfile } from "@/components/ProfileProvider";
import { PDPA_VERSION, REQUEST_STATUS, REQUEST_TYPES } from "@/lib/pdpa";
import { createClient } from "@/lib/supabase/client";

interface DataRequest {
  id: string;
  user_id: string;
  email: string | null;
  request_type: string;
  detail: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  handled_at: string | null;
}

const ROLE_TH = { admin: "ผู้ดูแลระบบ", teacher: "ครูผู้สอน", student: "นักเรียน" } as const;

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

export default function PdpaPage() {
  const supabase = createClient();
  const profile = useProfile();
  const privacy = usePrivacy();
  const isAdmin = profile.role === "admin";
  const [mine, setMine] = useState<DataRequest[]>([]);
  const [all, setAll] = useState<DataRequest[]>([]);
  const [type, setType] = useState("access");
  const [detail, setDetail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("data_requests").select("*").order("created_at", { ascending: false });
    if (error) { setMsg(`ยังใช้งานไม่ได้: ${error.message} (ให้ผู้ดูแลระบบรันไฟล์ SQL อัปเดต PDPA)`); return; }
    const rows = (data ?? []) as DataRequest[];
    setMine(rows.filter((r) => r.user_id === profile.id));
    setAll(rows);
  }, [supabase, profile.id]);

  useEffect(() => { load(); }, [load]);

  async function exportMyData() {
    const out: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      note: "ข้อมูลส่วนบุคคลของท่านในระบบจัดตารางเรียน-ตารางสอน วิทยาลัยการอาชีพโพนทอง",
      profile,
    };
    const { data: teacher } = await supabase.from("teachers").select("*").eq("user_id", profile.id).maybeSingle();
    if (teacher) {
      out.teacher = teacher;
      const { data: enr } = await supabase.from("enrollments").select("*, subjects(subject_code,subject_name), student_groups(group_code)").eq("teacher_id", teacher.id);
      out.teaching_load = enr;
      const { data: sch } = await supabase.from("schedule_details").select("day_of_week,start_period,end_period,subject_code,subject_name,group_code,room_code,status").eq("teacher_id", teacher.id);
      out.schedule = sch;
    }
    const { data: student } = await supabase.from("students").select("*").eq("user_id", profile.id).maybeSingle();
    if (student) {
      out.student = student;
      const { data: contact } = await supabase.from("student_contacts").select("*").eq("student_id", student.id).maybeSingle();
      out.student_contact = contact;
    }
    if (profile.student_group_id) {
      const { data: sch } = await supabase.from("schedule_details").select("day_of_week,start_period,end_period,subject_code,subject_name,teacher_name,room_code").eq("student_group_id", profile.student_group_id);
      out.group_schedule = sch;
    }
    out.data_requests = mine;
    download(`my-data-${new Date().toISOString().slice(0, 10)}.json`, out);
  }

  async function submit() {
    if (type !== "access" && !detail.trim()) return setMsg("กรุณาระบุรายละเอียดคำร้อง");
    const { error } = await supabase.from("data_requests").insert({
      user_id: profile.id, email: profile.email, request_type: type, detail: detail.trim() || null,
    });
    setMsg(error ? "ส่งคำร้องไม่สำเร็จ: " + error.message : "ส่งคำร้องแล้ว ผู้ดูแลระบบจะดำเนินการภายใน 30 วัน");
    if (!error) { setDetail(""); load(); }
  }

  async function withdraw() {
    if (!confirm("ถอนความยินยอม? ท่านจะใช้งานระบบต่อไม่ได้จนกว่าจะยินยอมอีกครั้ง และควรยื่นคำร้องขอลบข้อมูลหากต้องการให้ลบบัญชี")) return;
    const { error } = await supabase.rpc("withdraw_my_consent");
    if (error) return setMsg(error.message);
    await supabase.from("data_requests").insert({ user_id: profile.id, email: profile.email, request_type: "withdraw_consent", detail: "ถอนความยินยอมผ่านระบบ" });
    window.location.reload();
  }

  async function updateRequest(r: DataRequest, status: string) {
    const { error } = await supabase.from("data_requests").update({
      status, admin_note: notes[r.id] ?? r.admin_note,
      handled_at: status === "pending" ? null : new Date().toISOString(),
      handled_by: status === "pending" ? null : profile.id,
    }).eq("id", r.id);
    setMsg(error ? error.message : "อัปเดตคำร้องแล้ว");
    load();
  }

  const pending = all.filter((r) => r.status === "pending" || r.status === "in_progress").length;

  return (
    <div className="space-y-5">
      <PageHeader title="การคุ้มครองข้อมูลส่วนบุคคล (PDPA)"
        subtitle={<>ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 · วิทยาลัยการอาชีพโพนทอง · <Link href="/privacy" className="link">อ่านนโยบายความเป็นส่วนตัว</Link></>} />
      {msg && <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-800 dark:border-brand-800 dark:bg-brand-500/10 dark:text-brand-200">{msg}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 text-sm">
          <h2 className="card-title">ข้อมูลบัญชีของฉัน</h2>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-slate-400">ชื่อ-นามสกุล</dt><dd className="text-right font-medium text-slate-900 dark:text-white">{privacy.name(profile.full_name)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">อีเมล</dt><dd className="text-right font-mono text-slate-900 dark:text-white">{privacy.email(profile.email)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">สิทธิ์การใช้งาน</dt><dd className="text-right text-slate-900 dark:text-white">{ROLE_TH[profile.role]}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">ความยินยอม PDPA</dt><dd className="text-right">
              {profile.pdpa_consent_at
                ? <span className="font-medium text-emerald-700 dark:text-emerald-400">ยินยอมเมื่อ {new Date(profile.pdpa_consent_at).toLocaleDateString("th-TH")} (v{profile.pdpa_consent_version ?? PDPA_VERSION})</span>
                : <span className="text-amber-700">ยังไม่ได้ยินยอม</span>}
            </dd></div>
          </dl>
          <div className="flex flex-wrap gap-2 pt-2">
            <button className="btn-primary" onClick={exportMyData}>ดาวน์โหลดสำเนาข้อมูลของฉัน (.json)</button>
            {profile.pdpa_consent_at && <button className="btn-secondary" onClick={withdraw}>ถอนความยินยอม</button>}
          </div>
        </div>

        <div className="card space-y-3 text-sm">
          <h2 className="card-title">ยื่นคำร้องใช้สิทธิเจ้าของข้อมูล</h2>
          <div>
            <label className="label">เรื่องที่ต้องการยื่นคำร้อง</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(REQUEST_TYPES).filter(([k]) => k !== "withdraw_consent").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">รายละเอียดเพิ่มเติม</label>
            <textarea className="input" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)}
              placeholder="เช่น ขอแก้ไขชื่อ-สกุล เป็น ..." />
          </div>
          <button className="btn-primary" onClick={submit}>ส่งคำร้อง</button>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="card-title px-5 py-4">คำร้องของฉัน</h2>
        <table className="w-full">
          <thead><tr><th className="th">วันที่</th><th className="th">ประเภท</th><th className="th">รายละเอียด</th><th className="th">สถานะ</th><th className="th">หมายเหตุจากผู้ดูแล</th></tr></thead>
          <tbody>
            {mine.map((r) => (
              <tr key={r.id}>
                <td className="td">{new Date(r.created_at).toLocaleDateString("th-TH")}</td>
                <td className="td">{REQUEST_TYPES[r.request_type]}</td>
                <td className="td">{r.detail}</td>
                <td className="td"><span className={REQUEST_STATUS[r.status]?.cls}>{REQUEST_STATUS[r.status]?.label}</span></td>
                <td className="td">{r.admin_note}</td>
              </tr>
            ))}
            {mine.length === 0 && <tr><td className="td text-center text-slate-400" colSpan={5}>ยังไม่มีคำร้อง</td></tr>}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="card overflow-x-auto p-0">
          <div className="flex items-center gap-2 px-5 py-4">
            <h2 className="card-title">ประวัติคำร้องในระบบ (ผู้ดูแลระบบ)</h2>
            {pending > 0 && <span className="chip-amber">รอดำเนินการ {pending}</span>}
          </div>
          <p className="px-5 pb-3 text-xs text-slate-500">
            คำร้องขอลบบัญชี: ลบผู้ใช้ที่ Supabase → Authentication → Users (ข้อมูล profile จะถูกลบตามอัตโนมัติ) และลบ/แก้ข้อมูลครูที่เมนูครูผู้สอน แล้วกด “เสร็จสิ้น”
          </p>
          <table className="w-full">
            <thead><tr><th className="th">วันที่</th><th className="th">ผู้ยื่น</th><th className="th">ประเภท</th><th className="th">รายละเอียด</th><th className="th">หมายเหตุ</th><th className="th">สถานะ</th></tr></thead>
            <tbody>
              {all.map((r) => (
                <tr key={r.id}>
                  <td className="td whitespace-nowrap">{new Date(r.created_at).toLocaleString("th-TH")}</td>
                  <td className="td font-mono text-xs">{privacy.email(r.email)}</td>
                  <td className="td">{REQUEST_TYPES[r.request_type]}</td>
                  <td className="td">{r.detail}</td>
                  <td className="td">
                    <input className="input" defaultValue={r.admin_note ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  </td>
                  <td className="td">
                    <select className="input" value={r.status} onChange={(e) => updateRequest(r, e.target.value)}>
                      {Object.entries(REQUEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {all.length === 0 && <tr><td className="td text-center text-slate-400" colSpan={6}>ไม่มีคำร้อง</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
