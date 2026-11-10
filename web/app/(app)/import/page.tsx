"use client";

import Papa from "papaparse";
import { useMemo, useState } from "react";
import DataTabs from "@/components/DataTabs";
import PageHeader from "@/components/PageHeader";
import { AdminOnly } from "@/components/ProfileProvider";
import { coerce, ENTITIES, IMPORTABLE, type Entity } from "@/lib/entities";
import { createClient } from "@/lib/supabase/client";

type RawRow = Record<string, string>;
type Status = "new" | "duplicate" | "file-duplicate" | "error";
interface Checked {
  line: number;
  raw: RawRow;
  payload: Record<string, unknown>;
  status: Status;
  errors: string[];
  deferred: { target: string; table: string; match: string; value: string }[];
}

const STATUS_LABEL: Record<Status, { text: string; cls: string }> = {
  new: { text: "ใหม่", cls: "chip-green" },
  duplicate: { text: "มีในระบบแล้ว", cls: "chip-amber" },
  "file-duplicate": { text: "ซ้ำในไฟล์", cls: "chip-blue" },
  error: { text: "ผิดพลาด", cls: "chip-red" },
};

async function readFile(file: File): Promise<RawRow[]> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const headers: string[] = [];
    ws.getRow(1).eachCell((c, i) => (headers[i] = c.text.trim()));
    const rows: RawRow[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const r: RawRow = {};
      headers.forEach((h, i) => { if (h) r[h] = row.getCell(i).text ?? ""; });
      if (Object.values(r).some((v) => v.trim() !== "")) rows.push(r);
    });
    return rows;
  }
  const text = (await file.text()).replace(/^﻿/, "");
  const res = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  return res.data;
}

const keyOf = (entity: Entity, p: Record<string, unknown>) => entity.uniqueKey.map((k) => String(p[k] ?? "")).join("|");

export default function ImportPage() {
  const supabase = createClient();
  const [entityKey, setEntityKey] = useState("teachers");
  const entity = ENTITIES[entityKey];
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<Checked[]>([]);
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const summary = useMemo(() => {
    const s: Record<Status, number> = { new: 0, duplicate: 0, "file-duplicate": 0, error: 0 };
    checked.forEach((c) => s[c.status]++);
    return s;
  }, [checked]);

  function downloadTemplate() {
    const blob = new Blob(["﻿" + entity.sample + "\n"], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `template_${entity.key}.csv`;
    a.click();
  }

  async function precheck(f: File) {
    setBusy(true);
    setLog([]);
    try {
      const raw = await readFile(f);
      const missingCols = entity.importColumns.filter((c) => raw.length && !(c in raw[0]));
      const required = new Set([
        ...entity.fields.filter((x) => x.required && x.type !== "fk").map((x) => x.key),
        ...(entity.lookups ?? []).filter((l) => l.required).map((l) => l.column),
      ]);
      const missingRequired = missingCols.filter((c) => required.has(c));
      if (missingRequired.length) {
        setLog([`ไฟล์ไม่มีคอลัมน์ที่จำเป็น: ${missingRequired.join(", ")}`]);
        setChecked([]);
        return;
      }

      // โหลดตารางสำหรับจับคู่รหัส -> id
      const maps: Record<string, Map<string, string>> = {};
      for (const l of entity.lookups ?? []) {
        const { data } = await supabase.from(l.table).select(`id,${l.match}`).limit(10000);
        maps[l.column] = new Map(((data ?? []) as unknown as Record<string, string>[]).map((r) => [String(r[l.match]), r.id]));
      }

      // ข้อมูลที่มีอยู่แล้ว (สำหรับตรวจซ้ำ)
      const { data: existing } = await supabase.from(entity.table).select(entity.uniqueKey.join(",")).limit(20000);
      const existingKeys = new Set(((existing ?? []) as unknown as Record<string, unknown>[]).map((r) => keyOf(entity, r)));
      const seen = new Set<string>();
      const fileValues = new Set(raw.map((r) => (r[entity.uniqueKey[0]] ?? "").trim()));

      const out: Checked[] = raw.map((r, i) => {
        const errors: string[] = [];
        const payload: Record<string, unknown> = {};
        const deferred: Checked["deferred"] = [];
        for (const col of entity.importColumns) {
          const lookup = entity.lookups?.find((l) => l.column === col);
          const v = (r[col] ?? "").trim();
          if (lookup) {
            if (!v) {
              if (lookup.required) errors.push(`ไม่มีค่า ${col}`);
              continue;
            }
            const id = maps[col].get(v);
            if (id) payload[lookup.target] = id;
            else if (lookup.table === entity.table && fileValues.has(v)) deferred.push({ ...lookup, value: v });
            else errors.push(`ไม่พบ ${col} = "${v}" ในระบบ`);
            continue;
          }
          const field = entity.fields.find((x) => x.key === col);
          if (!field) continue;
          try {
            const val = coerce(field, v);
            if (val !== null) payload[col] = val;
            else if (field.required) errors.push(`ไม่มีค่า ${field.label}`);
          } catch (e) {
            errors.push(`${field.label}: ${(e as Error).message}`);
          }
        }
        let status: Status = "new";
        const k = keyOf(entity, payload);
        if (errors.length) status = "error";
        else if (seen.has(k)) status = "file-duplicate";
        else if (existingKeys.has(k)) status = "duplicate";
        seen.add(k);
        return { line: i + 2, raw: r, payload, status, errors, deferred };
      });
      setChecked(out);
      if (missingCols.length) setLog([`หมายเหตุ: ไม่มีคอลัมน์ (ไม่บังคับ) ${missingCols.join(", ")}`]);
    } catch (e) {
      setLog([`อ่านไฟล์ไม่สำเร็จ: ${(e as Error).message}`]);
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    if (!file) return;
    setBusy(true);
    const msgs: string[] = [];
    try {
      // 1) เก็บไฟล์ต้นฉบับไว้ใน Supabase Storage
      const path = `${entity.key}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const up = await supabase.storage.from("imports").upload(path, file);
      msgs.push(up.error ? `อัปโหลดไฟล์ไป Storage ไม่สำเร็จ: ${up.error.message}` : `เก็บไฟล์ต้นฉบับที่ imports/${path}`);

      // 2) บันทึกลงฐานข้อมูล
      const rows = checked.filter((c) => c.status === "new" || (mode === "update" && c.status === "duplicate"));
      let ok = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((c) => c.payload);
        const res = mode === "update"
          ? await supabase.from(entity.table).upsert(chunk, { onConflict: entity.uniqueKey.join(",") })
          : await supabase.from(entity.table).insert(chunk);
        if (res.error) msgs.push(`ผิดพลาดช่วงแถว ${i + 1}-${i + chunk.length}: ${res.error.message}`);
        else ok += chunk.length;
      }
      msgs.push(`บันทึกสำเร็จ ${ok} รายการ`);

      // 3) อ้างอิงภายในตารางเดียวกัน (เช่น กลุ่มคู่ขนาน) ทำหลังบันทึกรอบแรก
      const deferred = rows.filter((c) => c.deferred.length);
      if (deferred.length) {
        const { data } = await supabase.from(entity.table).select(`id,${entity.uniqueKey[0]}`).limit(10000);
        const m = new Map(((data ?? []) as unknown as Record<string, string>[]).map((r) => [String(r[entity.uniqueKey[0]]), r.id]));
        for (const c of deferred) {
          const patch: Record<string, unknown> = {};
          c.deferred.forEach((d) => (patch[d.target] = m.get(d.value)));
          await supabase.from(entity.table).update(patch).eq(entity.uniqueKey[0], c.payload[entity.uniqueKey[0]] as string);
        }
        msgs.push(`ผูกข้อมูลอ้างอิง ${deferred.length} รายการ`);
      }
      setChecked([]);
      setFile(null);
    } finally {
      setLog(msgs);
      setBusy(false);
    }
  }

  const importable = checked.filter((c) => c.status === "new" || (mode === "update" && c.status === "duplicate")).length;

  return (
    <AdminOnly>
      <div className="space-y-5">
        <DataTabs />
        <PageHeader title="นำเข้าไฟล์ CSV / Excel"
          subtitle="ระบบตรวจสอบข้อมูลซ้ำและความถูกต้องก่อนบันทึก (Pre-check) และเก็บไฟล์ต้นฉบับไว้ใน Storage" />
        <div className="card grid gap-5 md:grid-cols-3">
          <div>
            <label className="label">1. เลือกประเภทข้อมูล</label>
            <select className="input" value={entityKey}
              onChange={(e) => { setEntityKey(e.target.value); setChecked([]); setFile(null); }}>
              {IMPORTABLE.map((k) => <option key={k} value={k}>{ENTITIES[k].title}</option>)}
            </select>
            <button className="link mt-2 text-xs" onClick={downloadTemplate}>ดาวน์โหลดไฟล์ตัวอย่าง (.csv) →</button>
          </div>
          <div>
            <label className="label">2. เลือกไฟล์ (.csv, .xlsx)</label>
            <input type="file" accept=".csv,.xlsx" className="input"
              onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) precheck(f); }} />
            <p className="mt-1.5 text-xs text-slate-500">หัวคอลัมน์: <code className="font-mono text-[11px]">{entity.importColumns.join(", ")}</code></p>
          </div>
          <div>
            <label className="label">3. รายการที่มีอยู่แล้ว</label>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "skip" | "update")}>
              <option value="skip">ข้าม (ไม่เขียนทับ)</option>
              <option value="update">อัปเดตทับข้อมูลเดิม</option>
            </select>
          </div>
        </div>

        {log.length > 0 && (
          <div className="card space-y-1 text-sm text-slate-700 dark:text-slate-300">{log.map((l, i) => <p key={i}>• {l}</p>)}</div>
        )}

        {checked.length > 0 && (
          <div className="card space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b className="text-slate-900 dark:text-white">ผลการตรวจสอบ (Pre-check):</b>
              {(Object.keys(summary) as Status[]).map((s) => (
                <span key={s} className={STATUS_LABEL[s].cls}>{STATUS_LABEL[s].text} {summary[s]}</span>
              ))}
              <button className="btn-primary ml-auto" disabled={busy || importable === 0} onClick={doImport}>
                {busy ? "กำลังนำเข้า..." : `นำเข้า ${importable} รายการ`}
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
              <table className="w-full">
                <thead className="sticky top-0">
                  <tr>
                    <th className="th">แถว</th><th className="th">สถานะ</th>
                    {entity.importColumns.map((c) => <th key={c} className="th">{c}</th>)}
                    <th className="th">ปัญหา</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.map((c) => (
                    <tr key={c.line}>
                      <td className="td">{c.line}</td>
                      <td className="td"><span className={STATUS_LABEL[c.status].cls}>{STATUS_LABEL[c.status].text}</span></td>
                      {entity.importColumns.map((col) => <td key={col} className="td">{c.raw[col]}</td>)}
                      <td className="td text-xs text-red-600">{c.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminOnly>
  );
}
