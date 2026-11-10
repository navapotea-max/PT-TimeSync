"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { usePrivacy } from "@/components/Preferences";
import { AdminOnly } from "@/components/ProfileProvider";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Role, StudentGroup, Teacher } from "@/lib/types";

export default function UsersPage() {
  const supabase = createClient();
  const privacy = usePrivacy();
  const [users, setUsers] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [u, g, t] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at"),
      supabase.from("student_groups").select("id,group_code,group_name").order("group_code"),
      supabase.from("teachers").select("id,user_id,teacher_code,name,unavailable_times").order("teacher_code"),
    ]);
    setUsers(u.data ?? []);
    setGroups(g.data ?? []);
    setTeachers(t.data ?? []);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function update(id: string, patch: Partial<Profile>) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    setMsg(error ? "ผิดพลาด: " + error.message : "บันทึกแล้ว");
    load();
  }

  async function linkTeacher(userId: string, teacherId: string) {
    await supabase.from("teachers").update({ user_id: null }).eq("user_id", userId);
    if (teacherId) {
      const { error } = await supabase.from("teachers").update({ user_id: userId }).eq("id", teacherId);
      if (error) return setMsg("ผิดพลาด: " + error.message);
      await supabase.from("profiles").update({ role: "teacher" }).eq("id", userId).neq("role", "admin");
    }
    setMsg("บันทึกแล้ว");
    load();
  }

  return (
    <AdminOnly>
      <div className="space-y-5">
        <PageHeader title="ผู้ใช้งานและสิทธิ์"
          subtitle="ผู้ใช้ลงทะเบียนเองที่หน้าเข้าสู่ระบบ (หรือเพิ่มใน Supabase › Authentication) แล้วกำหนดสิทธิ์ ผูกข้อมูลครู หรือกลุ่มเรียนที่นี่"
          badge={<span className="chip-gray">{users.length} บัญชี</span>} />
        {msg && <p className="text-sm text-brand-700 dark:text-brand-300">{msg}</p>}
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead><tr><th className="th">อีเมล</th><th className="th">ชื่อ</th><th className="th">สิทธิ์</th><th className="th">ผูกกับครู</th><th className="th">กลุ่มนักเรียน</th><th className="th">ยินยอม PDPA</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="td font-mono text-xs">{privacy.email(u.email)}</td>
                  <td className="td font-medium text-slate-900 dark:text-white">{privacy.name(u.full_name)}</td>
                  <td className="td">
                    <select className="input" value={u.role} onChange={(e) => update(u.id, { role: e.target.value as Role })}>
                      <option value="admin">ผู้ดูแลระบบ</option>
                      <option value="teacher">ครูผู้สอน</option>
                      <option value="student">นักเรียน</option>
                    </select>
                  </td>
                  <td className="td">
                    <select className="input" value={teachers.find((t) => t.user_id === u.id)?.id ?? ""}
                      onChange={(e) => linkTeacher(u.id, e.target.value)}>
                      <option value="">—</option>
                      {teachers.filter((t) => !t.user_id || t.user_id === u.id).map((t) => (
                        <option key={t.id} value={t.id}>{t.teacher_code} {privacy.name(t.name)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="td">
                    <select className="input" value={u.student_group_id ?? ""}
                      onChange={(e) => update(u.id, { student_group_id: e.target.value || null })}>
                      <option value="">—</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.group_code}</option>)}
                    </select>
                  </td>
                  <td className="td text-xs">
                    {u.pdpa_consent_at
                      ? <span className="chip-green">ยินยอม {new Date(u.pdpa_consent_at).toLocaleDateString("th-TH")}</span>
                      : <span className="chip-amber">ยังไม่ยินยอม</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminOnly>
  );
}
