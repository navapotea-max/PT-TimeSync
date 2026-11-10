"use client";

import Link from "next/link";
import StudentProfile from "@/components/people/StudentProfile";
import { useProfile } from "@/components/ProfileProvider";

export default function StudentPage({ params }: { params: { id: string } }) {
  const p = useProfile();
  if (p.role === "student") return <div className="card text-sm text-slate-500">ไม่มีสิทธิ์เข้าถึงหน้านี้</div>;
  return (
    <div className="space-y-4">
      <Link href="/directory?tab=students" className="link text-xs">← รายชื่อครูและนักเรียน</Link>
      <StudentProfile studentId={params.id} />
    </div>
  );
}
