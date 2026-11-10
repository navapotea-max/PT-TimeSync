"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DataTabs from "@/components/DataTabs";
import { IconPlus, IconSearch, IconX } from "@/components/Icons";
import { maskEmail, maskName, maskPhone, usePrivacy } from "@/components/Preferences";
import { coerce, type Entity, type Field } from "@/lib/entities";
import { createClient } from "@/lib/supabase/client";

type Row = Record<string, unknown> & { id: string };
type Options = Record<string, { value: string; label: string }[]>;

function display(field: Field, value: unknown, fkOptions: Options, privacy = false): string {
  const out = rawDisplay(field, value, fkOptions);
  if (!privacy || !field.pii || out === "-") return out;
  if (field.pii === "email") return maskEmail(out);
  if (field.pii === "phone") return maskPhone(out);
  // fk ที่มีรหัสนำหน้า (เช่น "T01 ครูสมชาย ใจดี") ปิดบังเฉพาะส่วนชื่อ
  if (field.type === "fk") { const [code, ...rest] = out.split(" "); return `${code} ${maskName(rest.join(" "))}`; }
  return maskName(out);
}

function rawDisplay(field: Field, value: unknown, fkOptions: Options): string {
  if (value === null || value === undefined || value === "") return "-";
  if (field.type === "boolean") return value ? "✓" : "";
  if (field.type === "fk") return fkOptions[field.key]?.find((o) => o.value === value)?.label ?? "?";
  if (field.type === "select") return field.options?.find((o) => o.value === String(value))?.label ?? String(value);
  if (field.type === "json") return JSON.stringify(value);
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function toInput(field: Field, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (field.type === "json") return JSON.stringify(value, null, 2);
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

export default function CrudPage({ entity }: { entity: Entity }) {
  const supabase = createClient();
  const { enabled: privacy } = usePrivacy();
  const [rows, setRows] = useState<Row[]>([]);
  const [fkOptions, setFkOptions] = useState<Options>({});
  const [search, setSearch] = useState("");
  const [filterSemester, setFilterSemester] = useState<string>("");
  const [editing, setEditing] = useState<Record<string, string | boolean> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hasSemester = entity.fields.some((f) => f.key === "semester_id");

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from(entity.table).select("*").order(entity.orderBy).limit(5000);
    if (hasSemester && filterSemester) q = q.eq("semester_id", filterSemester);
    const { data, error } = await q;
    if (error) setError(error.message);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [supabase, entity, hasSemester, filterSemester]);

  useEffect(() => {
    (async () => {
      const opts: Options = {};
      for (const f of entity.fields.filter((f) => f.type === "fk")) {
        const { data } = await supabase.from(f.fk!.table).select(["id", ...f.fk!.labelCols].join(",")).order(f.fk!.order);
        opts[f.key] = ((data ?? []) as unknown as Record<string, string>[]).map((r) => ({
          value: r.id,
          label: f.fk!.labelCols.map((c) => r[c]).join(" "),
        }));
        if (f.key === "semester_id" && !filterSemester) {
          const { data: act } = await supabase.from("semesters").select("id").eq("is_active", true).maybeSingle();
          if (act) setFilterSemester(act.id);
        }
      }
      setFkOptions(opts);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, entity]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      entity.fields.some((f) => rawDisplay(f, r[f.key], fkOptions).toLowerCase().includes(s)));
  }, [rows, search, entity, fkOptions]);

  function openNew() {
    const blank: Record<string, string | boolean> = {};
    entity.fields.forEach((f) => (blank[f.key] = f.type === "boolean" ? false : ""));
    if (hasSemester && filterSemester) blank.semester_id = filterSemester;
    setEditId(null);
    setEditing(blank);
    setError(null);
  }

  function openEdit(r: Row) {
    const v: Record<string, string | boolean> = {};
    entity.fields.forEach((f) => (v[f.key] = f.type === "boolean" ? Boolean(r[f.key]) : toInput(f, r[f.key])));
    setEditId(r.id);
    setEditing(v);
    setError(null);
  }

  async function save() {
    if (!editing) return;
    setError(null);
    const payload: Record<string, unknown> = {};
    try {
      for (const f of entity.fields) {
        const val = coerce(f, editing[f.key]);
        if (f.required && (val === null || val === "")) throw new Error(`กรุณากรอก "${f.label}"`);
        payload[f.key] = val;
      }
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (entity.table === "semesters" && payload.config === null) delete payload.config;
    // ภาคเรียนปัจจุบันมีได้ 1 ภาค -> ใช้ RPC
    const makeActive = entity.table === "semesters" && payload.is_active === true;
    if (makeActive) payload.is_active = false;

    const res = editId
      ? await supabase.from(entity.table).update(payload).eq("id", editId).select().single()
      : await supabase.from(entity.table).insert(payload).select().single();
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (makeActive) await supabase.rpc("set_active_semester", { p_semester: res.data.id });
    setEditing(null);
    load();
  }

  async function remove(r: Row) {
    if (!confirm("ยืนยันการลบรายการนี้?")) return;
    const { error } = await supabase.from(entity.table).delete().eq("id", r.id);
    if (error) alert("ลบไม่สำเร็จ: " + error.message);
    load();
  }

  const tableFields = entity.fields.filter((f) => !f.hideInTable);

  return (
    <div className="space-y-5">
      <DataTabs />
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="page-title">{entity.title}</h1>
          <p className="page-sub">แสดงผล {filtered.length} รายการ</p>
        </div>
        {hasSemester && (
          <select className="input w-auto" value={filterSemester} onChange={(e) => setFilterSemester(e.target.value)}>
            <option value="">ทุกภาคเรียน</option>
            {fkOptions.semester_id?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input className="input w-64 pl-8" placeholder={`ค้นหา${entity.title}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={openNew}><IconPlus className="h-3.5 w-3.5" />เพิ่ม{entity.title}</button>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              {tableFields.map((f) => <th key={f.key} className="th whitespace-nowrap">{f.label}</th>)}
              <th className="th w-32 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="td text-center text-slate-400" colSpan={99}>กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td className="td text-center text-slate-400" colSpan={99}>ไม่มีข้อมูล</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                {tableFields.map((f) => <td key={f.key} className="td">{display(f, r[f.key], fkOptions, privacy)}</td>)}
                <td className="td whitespace-nowrap text-right">
                  <button className="mr-4 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400" onClick={() => openEdit(r)}>แก้ไข</button>
                  <button className="text-xs text-slate-400 hover:text-red-600 dark:hover:text-red-400" onClick={() => remove(r)}>ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{editId ? "แก้ไข" : "เพิ่ม"}{entity.title}</h2>
              <button className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" onClick={() => setEditing(null)} aria-label="ปิด"><IconX /></button>
            </div>
            <div className="space-y-3">
              {entity.fields.map((f) => (
                <div key={f.key}>
                  <label className="label">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
                  {f.type === "boolean" ? (
                    <input type="checkbox" className="h-4 w-4" checked={Boolean(editing[f.key])}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.checked })} />
                  ) : f.type === "select" || f.type === "fk" ? (
                    <select className="input" value={String(editing[f.key] ?? "")}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}>
                      <option value="">— เลือก —</option>
                      {(f.type === "select" ? f.options : fkOptions[f.key])?.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : f.type === "json" ? (
                    <textarea className="input font-mono text-xs" rows={6} value={String(editing[f.key] ?? "")}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })} />
                  ) : (
                    <input className="input" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      value={String(editing[f.key] ?? "")}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })} />
                  )}
                  {f.help && <p className="mt-1 text-xs text-slate-500">{f.help}</p>}
                </div>
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>ยกเลิก</button>
              <button className="btn-primary" onClick={save}>บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
