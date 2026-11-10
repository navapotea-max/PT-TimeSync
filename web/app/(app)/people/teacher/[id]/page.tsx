"use client";

import Link from "next/link";
import TeacherProfile from "@/components/people/TeacherProfile";
import { useProfile } from "@/components/ProfileProvider";

export default function TeacherPage({ params }: { params: { id: string } }) {
  const p = useProfile();
  if (p.role === "student") return <div className="card text-sm text-slate-500">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>;
  return (
    <div className="space-y-4">
      <Link href="/directory?tab=teachers" className="link text-xs">← รายชื่อครูและนักเรียน</Link>
      <TeacherProfile teacherId={params.id} />
    </div>
  );
}
