"use client";

import Link from "next/link";
import { useState } from "react";
import { PDPA_VERSION } from "@/lib/pdpa";
import { createClient } from "@/lib/supabase/client";

/** แสดงเมื่อผู้ใช้ยังไม่เคยยินยอมตามนโยบายความเป็นส่วนตัว (เช่น ผู้ใช้ที่สมัครก่อนมีระบบ PDPA) */
export default function ConsentDialog({ onDone }: { onDone: () => void }) {
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    const { error } = await supabase.rpc("record_my_consent", { p_version: PDPA_VERSION });
    setBusy(false);
    if (error) setErr(error.message.includes("record_my_consent")
      ? "ยังไม่ได้รันไฟล์ SQL อัปเดต PDPA (20251110000000_backup_pdpa.sql) ในฐานข้อมูล"
      : error.message);
    else onDone();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 text-base font-bold text-slate-900 dark:text-white">การคุ้มครองข้อมูลส่วนบุคคล (PDPA)</h2>
        <p className="text-sm text-slate-600">
          ระบบจัดเก็บและใช้ ชื่อ-สกุล อีเมล ตารางสอน/ตารางเรียน และเวลาที่ไม่สะดวกสอนของท่าน
          เพื่อการจัดตารางเรียนตารางสอนของวิทยาลัยเท่านั้น ไม่เปิดเผยแก่บุคคลภายนอก
          ท่านสามารถขอเข้าถึง แก้ไข ลบ หรือถอนความยินยอมได้ที่เมนู “PDPA / ข้อมูลส่วนบุคคล”
        </p>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>
            ข้าพเจ้าได้อ่านและยอมรับ{" "}
            <Link href="/privacy" target="_blank" className="link">นโยบายความเป็นส่วนตัว</Link>{" "}
            (ฉบับที่ {PDPA_VERSION})
          </span>
        </label>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          {err && <button className="btn-secondary" onClick={onDone}>ปิดไว้ก่อน</button>}
          <form action="/auth/signout" method="post"><button className="btn-secondary">ไม่ยอมรับ (ออกจากระบบ)</button></form>
          <button className="btn-primary" disabled={!checked || busy} onClick={accept}>ยอมรับและใช้งานต่อ</button>
        </div>
      </div>
    </div>
  );
}
