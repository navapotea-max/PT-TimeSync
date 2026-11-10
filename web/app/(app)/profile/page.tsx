"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import StudentProfile from "@/components/people/StudentProfile";
import TeacherProfile from "@/components/people/TeacherProfile";
import { InfoGrid, Section } from "@/components/people/Parts";
import { usePrivacy } from "@/components/Preferences";
import { useProfile } from "@/components/ProfileProvider";
import { createClient } from "@/lib/supabase/client";

const ROLE_TH = { admin: "ผู้ดูแลระบบ", teacher: "ครูผู้สอน", student: "นักเรียน" } as const;

/** โปรไฟล์ของฉัน: แสดงข้อมูลครูหรือนักเรียนที่ผูกกับบัญชีนี้ */
export default function MyProfilePage() {
  const supabase = createClient();
  const profile = useProfile();
  const privacy = usePrivacy();
  const [person, setPerson] = useState<{ kind: "teacher" | "student"; id: string } | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      if (profile.teacher_id) return setPerson({ kind: "teacher", id: profile.teacher_id });
      if (profile.student_id) return setPerson({ kind: "student", id: profile.student_id });
      if (profile.role !== "student") {
        const { data: t } = await supabase.from("teachers").select("id").eq("user_id", profile.id).maybeSingle();
        if (t) return setPerson({ kind: "teacher", id: t.id });
      }
      if (profile.role !== "teacher") {
        const { data: s } = await supabase.from("students").select("id").eq("user_id", profile.id).maybeSingle();
        if (s && profile.role === "student") return setPerson({ kind: "student", id: s.id });
      }
      setPerson(null);
    })();
  }, [supabase, profile]);

  if (person === undefined) return <div className="card text-sm text-slate-400">กำลังโหลด...</div>;
  if (person?.kind === "teacher") return <TeacherProfile teacherId={person.id} />;
  if (person?.kind === "student") return <StudentProfile studentId={person.id} />;

  return (
    <div className="space-y-5">
      <PageHeader title="โปรไฟล์ของฉัน" subtitle="ข้อมูลบัญชีผู้ใช้งาน" />
      <Section title="บัญชีผู้ใช้">
        <InfoGrid items={[
          { label: "ชื่อ-นามสกุล", value: privacy.name(profile.full_name) },
          { label: "อีเมล", value: privacy.email(profile.email), mono: true },
          { label: "สิทธิ์การใช้งาน", value: ROLE_TH[profile.role] },
          { label: "ความยินยอม PDPA", value: profile.pdpa_consent_at ? new Date(profile.pdpa_consent_at).toLocaleDateString("th-TH") : "ยังไม่ยินยอม" },
        ]} />
      </Section>
      <div className="card text-sm text-slate-600 dark:text-slate-300">
        {profile.role === "admin" ? (
          <>บัญชีผู้ดูแลระบบนี้ยังไม่ได้ผูกกับข้อมูลครู หากท่านเป็นครูด้วย ให้ผูกบัญชีที่ <Link href="/users" className="link">ผู้ใช้งานและสิทธิ์</Link> ·
            ดูข้อมูลครูและนักเรียนทั้งหมดได้ที่ <Link href="/directory" className="link">รายชื่อครูและนักเรียน</Link></>
        ) : (
          <>บัญชีนี้ยังไม่ได้ผูกกับข้อมูล{profile.role === "teacher" ? "ครู" : "นักเรียน"} — กรุณาแจ้งผู้ดูแลระบบให้ใส่อีเมลของท่านในข้อมูล{profile.role === "teacher" ? "ครู" : "นักเรียน"}</>
        )}
      </div>
    </div>
  );
}
