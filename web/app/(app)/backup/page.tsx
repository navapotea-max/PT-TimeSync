"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { AdminOnly, useProfile } from "@/components/ProfileProvider";
import { BACKUP_TABLES, backupToExcel, createBackup, restoreBackup, validateBackup, type BackupFile } from "@/lib/backup";
import { createClient } from "@/lib/supabase/client";

interface StoredFile { name: string; created_at: string; metadata?: { size?: number } }

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_");

export default function BackupPage() {
  const supabase = createClient();
  const profile = useProfile();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [anonymized, setAnonymized] = useState(false);
  const [saveCloud, setSaveCloud] = useState(true);
  const [pending, setPending] = useState<{ backup: BackupFile; source: string } | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [confirmText, setConfirmText] = useState("");

  const addLog = (m: string) => setLog((l) => [...l, m]);

  const loadFiles = useCallback(async () => {
    const { data, error } = await supabase.storage.from("backups").list("", { sortBy: { column: "created_at", order: "desc" }, limit: 100 });
    if (error) addLog(`อ่านรายการไฟล์ใน Storage ไม่ได้: ${error.message} (รันไฟล์ SQL อัปเดตแล้วหรือยัง?)`);
    setFiles((Array.isArray(data) ? (data as StoredFile[]) : []).filter((f) => f.name?.endsWith(".json")));
  }, [supabase]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  async function doBackup(format: "json" | "xlsx") {
    setBusy(true);
    setLog([]);
    try {
      const b = await createBackup(supabase, profile.email, anonymized, addLog);
      const base = `backup_${stamp()}${anonymized ? "_anonymized" : ""}`;
      if (format === "json") {
        const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
        saveBlob(blob, `${base}.json`);
        if (saveCloud) {
          const { error } = await supabase.storage.from("backups").upload(`${base}.json`, blob, { contentType: "application/json" });
          addLog(error ? `⚠ เก็บไว้ใน Storage ไม่สำเร็จ: ${error.message}` : `เก็บสำเนาไว้ใน Storage: backups/${base}.json`);
        }
      } else {
        const buf = await backupToExcel(b);
        saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${base}.xlsx`);
      }
      addLog(`✅ สำรองข้อมูลสำเร็จ: ${Object.entries(b.counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
      loadFiles();
    } catch (e) {
      addLog(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function openFile(file: File) {
    try {
      setPending({ backup: validateBackup(JSON.parse(await file.text())), source: file.name });
      setConfirmText("");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function openStored(name: string) {
    const { data, error } = await supabase.storage.from("backups").download(name);
    if (error || !data) return alert(error?.message ?? "ดาวน์โหลดไม่สำเร็จ");
    try {
      setPending({ backup: validateBackup(JSON.parse(await data.text())), source: name });
      setConfirmText("");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function downloadStored(name: string) {
    const { data, error } = await supabase.storage.from("backups").download(name);
    if (error || !data) return alert(error?.message);
    saveBlob(data, name);
  }

  async function removeStored(name: string) {
    if (!confirm(`ลบไฟล์ ${name}?`)) return;
    await supabase.storage.from("backups").remove([name]);
    loadFiles();
  }

  async function doRestore() {
    if (!pending) return;
    setBusy(true);
    setLog([]);
    try {
      // สำรองข้อมูลปัจจุบันอัตโนมัติก่อนกู้คืน (กันพลาด)
      addLog("สำรองข้อมูลปัจจุบันอัตโนมัติก่อนกู้คืน...");
      const safety = await createBackup(supabase, profile.email, false);
      const name = `backup_${stamp()}_before-restore.json`;
      const { error } = await supabase.storage.from("backups").upload(name,
        new Blob([JSON.stringify(safety)], { type: "application/json" }), { contentType: "application/json" });
      if (error) throw new Error(`สำรองข้อมูลก่อนกู้คืนไม่สำเร็จ (${error.message}) — ยกเลิกการกู้คืนเพื่อความปลอดภัย`);
      addLog(`เก็บสำรองก่อนกู้คืน: backups/${name}`);

      await restoreBackup(supabase, pending.backup, mode, addLog);
      addLog("✅ กู้คืนข้อมูลเสร็จสิ้น");
      setPending(null);
      loadFiles();
    } catch (e) {
      addLog(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const canRestore = pending && !pending.backup.anonymized && (mode === "merge" || confirmText === "ยืนยัน");

  return (
    <AdminOnly>
      <div className="space-y-5">
        <PageHeader title="สำรองและกู้คืนฐานข้อมูล"
          subtitle="ส่งออกข้อมูลทั้งระบบเก็บไว้เป็นไฟล์ .json และกู้คืนข้อมูลย้อนหลังได้ตลอดเวลา" />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card space-y-3 text-sm">
            <h2 className="card-title">สร้างไฟล์สำรองข้อมูล</h2>
            <p className="text-xs text-slate-500">ครอบคลุมข้อมูล: {BACKUP_TABLES.map((t) => t.label).join(", ")}</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={saveCloud} onChange={(e) => setSaveCloud(e.target.checked)} />
              เก็บสำเนาไว้ใน Supabase Storage ด้วย
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={anonymized} onChange={(e) => setAnonymized(e.target.checked)} />
              <span>ปิดบังข้อมูลส่วนบุคคล (PDPA) — ชื่อ/อีเมลถูกแทนด้วย *** เหมาะสำหรับส่งให้ผู้อื่นตรวจสอบ <b>(ไฟล์แบบนี้กู้คืนไม่ได้)</b></span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={busy} onClick={() => doBackup("json")}>💾 สำรองข้อมูล (.json)</button>
              <button className="btn-secondary" disabled={busy} onClick={() => doBackup("xlsx")}>📊 ส่งออกทุกตาราง (.xlsx)</button>
            </div>
            <p className="text-xs text-slate-500">แนะนำ: สำรองทุกครั้งก่อนจัดตารางใหม่ / ก่อนนำเข้าข้อมูลชุดใหญ่ และเก็บไฟล์ .json ไว้ในเครื่องหรือ Google Drive ของวิทยาลัย</p>
          </div>

          <div className="card space-y-3 text-sm">
            <h2 className="card-title">กู้คืนข้อมูลย้อนหลัง</h2>
            <p className="text-xs text-slate-500">เลือกไฟล์สำรอง (.json) จากเครื่อง หรือกด “กู้คืน” ที่ไฟล์ในระบบคลาวด์ด้านล่าง</p>
            <input type="file" accept=".json,application/json" className="input"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ""; }} />
            <p className="text-xs text-slate-500">ระบบจะสำรองข้อมูลปัจจุบันให้อัตโนมัติก่อนกู้คืนทุกครั้ง</p>
          </div>
        </div>

        {pending && (
          <div className="card space-y-3 border-amber-300 text-sm dark:border-amber-500/40">
            <h2 className="card-title">กู้คืนจาก: <span className="font-mono">{pending.source}</span></h2>
            <p>สร้างเมื่อ {new Date(pending.backup.created_at).toLocaleString("th-TH")} โดย {pending.backup.created_by ?? "-"}</p>
            <div className="flex flex-wrap gap-2">
              {BACKUP_TABLES.map((t) => (
                <span key={t.table} className="chip-gray">{t.label}: {pending.backup.counts[t.table] ?? 0}</span>
              ))}
            </div>
            {pending.backup.anonymized ? (
              <p className="font-semibold text-red-600">ไฟล์นี้ปิดบังข้อมูลส่วนบุคคล — ไม่สามารถกู้คืนได้</p>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} />
                    <span><b>รวมข้อมูล</b> — เพิ่ม/อัปเดตรายการจากไฟล์ ข้อมูลอื่นที่มีอยู่ยังคงเดิม (ปลอดภัย)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                    <span className="text-red-600"><b>แทนที่ทั้งหมด</b> — ลบข้อมูลหลักและตารางสอนปัจจุบันทั้งหมด แล้วใช้ข้อมูลจากไฟล์</span>
                  </label>
                </div>
                {mode === "replace" && (
                  <div>
                    <label className="label">พิมพ์คำว่า <b>ยืนยัน</b> เพื่อดำเนินการ</label>
                    <input className="input max-w-xs" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={busy} onClick={() => setPending(null)}>ยกเลิก</button>
              <button className={mode === "replace" ? "btn-danger" : "btn-primary"} disabled={busy || !canRestore} onClick={doRestore}>
                {busy ? "กำลังกู้คืน..." : "เริ่มกู้คืนข้อมูล"}
              </button>
            </div>
          </div>
        )}

        {log.length > 0 && (
          <div className="card max-h-72 space-y-1 overflow-y-auto font-mono text-xs text-slate-700 dark:text-slate-300">{log.map((l, i) => <p key={i}>{l}</p>)}</div>
        )}

        <div className="card overflow-x-auto p-0">
          <h2 className="card-title px-5 py-4">ไฟล์สำรองในระบบคลาวด์ (Supabase Storage)</h2>
          <table className="w-full">
            <thead><tr><th className="th">ชื่อไฟล์</th><th className="th">วันที่สร้าง</th><th className="th">ขนาดไฟล์</th><th className="th text-right">จัดการ</th></tr></thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.name}>
                  <td className="td font-mono text-xs">{f.name}</td>
                  <td className="td">{new Date(f.created_at).toLocaleString("th-TH")}</td>
                  <td className="td font-mono text-xs">{f.metadata?.size ? `${(f.metadata.size / 1024).toFixed(0)} KB` : "-"}</td>
                  <td className="td whitespace-nowrap text-right">
                    <button className="mr-4 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400" onClick={() => downloadStored(f.name)}>ดาวน์โหลด</button>
                    <button className="mr-4 text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40 dark:text-brand-400" disabled={busy || f.name.includes("anonymized")} onClick={() => openStored(f.name)}>กู้คืน</button>
                    <button className="text-xs text-slate-400 hover:text-red-600" onClick={() => removeStored(f.name)}>ลบ</button>
                  </td>
                </tr>
              ))}
              {files.length === 0 && <tr><td className="td text-center text-slate-400" colSpan={4}>ยังไม่มีไฟล์สำรอง</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AdminOnly>
  );
}
