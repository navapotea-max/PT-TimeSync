"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Profile, Role } from "@/lib/types";

/**
 * มุมมองผู้ใช้งาน (View as)
 * ผู้ดูแลระบบสามารถสลับดูระบบในมุมมองของครูผู้สอนหรือนักเรียนคนใดก็ได้
 * - เป็นการจำลองการแสดงผลฝั่งหน้าเว็บเท่านั้น สิทธิ์จริงในฐานข้อมูล (RLS) ยังเป็นของบัญชีที่ล็อกอิน
 * - ผู้ใช้ที่ไม่ใช่ผู้ดูแลระบบจะไม่เห็นและใช้ฟีเจอร์นี้ไม่ได้
 */
export interface ViewAs {
  role: Role;
  teacherId: string | null;
  groupId: string | null;
  studentId?: string | null;
}

interface ViewCtx {
  /** บัญชีที่ล็อกอินจริง */
  real: Profile;
  isRealAdmin: boolean;
  /** กำลังจำลองมุมมองผู้ใช้อื่นอยู่หรือไม่ */
  simulating: boolean;
  view: ViewAs;
  setView: (v: ViewAs) => void;
}

const VIEW_KEY = "pt-view-as";
const ProfileCtx = createContext<Profile | null>(null);
const ViewAsCtx = createContext<ViewCtx | null>(null);

export function ProfileProvider({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const isRealAdmin = profile.role === "admin";
  const [view, setViewState] = useState<ViewAs>({ role: profile.role, teacherId: null, groupId: null });

  useEffect(() => {
    if (!isRealAdmin) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? "null") as ViewAs | null;
      if (saved?.role) setViewState(saved);
    } catch { /* ignore */ }
  }, [isRealAdmin]);

  const setView = useCallback((v: ViewAs) => {
    setViewState(v);
    try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(v)); } catch { /* ignore */ }
  }, []);

  const simulating = isRealAdmin && view.role !== "admin";

  const effective = useMemo<Profile>(() => {
    if (!simulating) return profile;
    return {
      ...profile,
      role: view.role,
      student_group_id: view.role === "student" ? view.groupId : null,
      teacher_id: view.role === "teacher" ? view.teacherId : null,
      student_id: view.role === "student" ? view.studentId ?? null : null,
    };
  }, [profile, simulating, view]);

  const ctx = useMemo<ViewCtx>(() => ({ real: profile, isRealAdmin, simulating, view, setView }),
    [profile, isRealAdmin, simulating, view, setView]);

  return (
    <ViewAsCtx.Provider value={ctx}>
      <ProfileCtx.Provider value={effective}>{children}</ProfileCtx.Provider>
    </ViewAsCtx.Provider>
  );
}

/** โปรไฟล์ตามมุมมองที่กำลังแสดง (ถ้าผู้ดูแลระบบจำลองมุมมองอยู่ จะได้บทบาทที่จำลอง) */
export function useProfile(): Profile {
  const p = useContext(ProfileCtx);
  if (!p) throw new Error("useProfile must be used inside ProfileProvider");
  return p;
}

export function useViewAs(): ViewCtx {
  const v = useContext(ViewAsCtx);
  if (!v) throw new Error("useViewAs must be used inside ProfileProvider");
  return v;
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const p = useProfile();
  if (p.role !== "admin") {
    return <div className="card text-center text-sm text-slate-500 dark:text-slate-400">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</div>;
  }
  return <>{children}</>;
}
