"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { coerce, type Entity, type Field } from "@/lib/entities";
import { createClient } from "@/lib/supabase/client";

type Row = Record<string, unknown> & { id: string };
type Options = Record<string, { value: string; label: string }[]>;

function display(field: Field, value: unknown, fkOptions: Options): string {
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
      entity.fields.some((f) => display(f, r[f.key], fkOptions).toLowerCase().includes(s)));
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">{entity.title}</h1>
        {hasSemester && (
          <select className="input w-auto" value={filterSemester} onChange={(e) => setFilterSemester(e.target.value)}>
            <option value="">ทุกภาคเรียน</option>
            {fkOptions.semester_id?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <input className="input w-60" placeholder="ค้นหา..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-primary" onClick={openNew}>+ เพิ่ม{entity.title}</button>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              {tableFields.map((f) => <th key={f.key} className="th">{f.label}</th>)}
              <th className="th w-32"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="td text-center text-slate-400" colSpan={99}>กำลังโหลด...</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td className="td text-center text-slate-400" colSpan={99}>ไม่มีข้อมูล</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                {tableFields.map((f) => <td key={f.key} className="td">{display(f, r[f.key], fkOptions)}</td>)}
                <td className="td whitespace-nowrap text-right">
                  <button className="mr-3 text-brand-600 hover:underline" onClick={() => openEdit(r)}>แก้ไข</button>
                  <button className="text-red-600 hover:underline" onClick={() => remove(r)}>ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">ทั้งหมด {filtered.length} รายการ</p>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">{editId ? "แก้ไข" : "เพิ่ม"}{entity.title}</h2>
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
