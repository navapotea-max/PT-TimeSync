import type { SupabaseClient } from "@supabase/supabase-js";
import { maskEmail, maskName, maskPhone } from "@/components/Preferences";

export const BACKUP_FORMAT = "pt-timesync-backup";
export const BACKUP_VERSION = 1;

/** ลำดับตาราง = ลำดับที่ต้องกู้คืน (ตารางแม่ก่อนตารางลูก) */
export const BACKUP_TABLES = [
  { table: "semesters", label: "ภาคเรียน" },
  { table: "subjects", label: "รายวิชา" },
  { table: "rooms", label: "ห้องเรียน" },
  { table: "student_groups", label: "กลุ่มนักเรียน" },
  { table: "teachers", label: "ครูผู้สอน" },
  { table: "students", label: "นักเรียน" },
  { table: "student_contacts", label: "ข้อมูลติดต่อนักเรียน" },
  { table: "enrollments", label: "ภาระงานสอน" },
  { table: "schedules", label: "ตารางสอน" },
  { table: "profiles", label: "ผู้ใช้ (สิทธิ์)" },
  { table: "data_requests", label: "คำร้อง PDPA" },
] as const;

export type Row = Record<string, unknown>;
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  created_at: string;
  created_by: string | null;
  anonymized: boolean;
  counts: Record<string, number>;
  tables: Record<string, Row[]>;
}

async function fetchAll(sb: SupabaseClient, table: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").order("id").range(from, from + 999);
    if (error) {
      // ตารางที่ยังไม่ได้สร้าง (เช่น ยังไม่ได้รัน SQL อัปเดต) ให้ข้ามไป
      if (/does not exist|schema cache/i.test(error.message)) return out;
      throw new Error(`${table}: ${error.message}`);
    }
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

function anonymize(table: string, rows: Row[]): Row[] {
  return rows.map((r) => {
    const x = { ...r };
    if ("email" in x) x.email = maskEmail(x.email as string);
    if (table === "teachers" && x.name) x.name = maskName(x.name as string);
    if (table === "profiles" && x.full_name) x.full_name = maskName(x.full_name as string);
    if (table === "data_requests") x.detail = x.detail ? "[ปิดบัง]" : null;
    if (table === "students") {
      x.first_name = maskName(x.first_name as string);
      x.last_name = maskName(x.last_name as string);
      x.nickname = null;
      x.photo_path = null;
    }
    if (table === "teachers") { x.phone = maskPhone(x.phone as string) || null; x.photo_path = null; }
    if (table === "student_contacts") {
      x.phone = maskPhone(x.phone as string) || null;
      x.parent_phone = maskPhone(x.parent_phone as string) || null;
      x.parent_name = maskName(x.parent_name as string) || null;
      x.address = x.address ? "[ปิดบัง]" : null;
      x.birth_date = null;
    }
    return x;
  });
}

export async function createBackup(sb: SupabaseClient, createdBy: string | null, anonymized: boolean,
  onProgress?: (msg: string) => void): Promise<BackupFile> {
  const tables: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    onProgress?.(`กำลังอ่าน ${t.label}...`);
    const rows = await fetchAll(sb, t.table);
    tables[t.table] = anonymized ? anonymize(t.table, rows) : rows;
    counts[t.table] = rows.length;
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, created_at: new Date().toISOString(), created_by: createdBy, anonymized, counts, tables };
}

export function validateBackup(raw: unknown): BackupFile {
  const b = raw as BackupFile;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.tables !== "object") throw new Error("ไม่ใช่ไฟล์สำรองข้อมูลของระบบนี้");
  if (b.version > BACKUP_VERSION) throw new Error("ไฟล์สำรองมาจากระบบเวอร์ชันใหม่กว่า");
  return b;
}

async function upsert(sb: SupabaseClient, table: string, rows: Row[], log: (m: string) => void) {
  let ok = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await sb.from(table).upsert(chunk, { onConflict: "id" });
    if (error) log(`⚠ ${table} แถว ${i + 1}-${i + chunk.length}: ${error.message}`);
    else ok += chunk.length;
  }
  return ok;
}

const ALL = "00000000-0000-0000-0000-000000000000";

/**
 * กู้คืนข้อมูล
 *  - merge   : เพิ่ม/อัปเดตตาม id (ข้อมูลที่ไม่มีในไฟล์ยังคงอยู่)
 *  - replace : ลบข้อมูลหลักและตารางสอนทั้งหมดก่อน แล้วนำเข้าจากไฟล์
 */
export async function restoreBackup(sb: SupabaseClient, b: BackupFile, mode: "merge" | "replace", log: (m: string) => void) {
  if (b.anonymized) throw new Error("ไฟล์นี้เป็นแบบปิดบังข้อมูลส่วนบุคคล ใช้สำหรับส่งต่อ/ตรวจสอบเท่านั้น ไม่สามารถกู้คืนได้");
  const T = b.tables;

  if (mode === "replace") {
    for (const t of ["schedules", "enrollments", "student_contacts", "students", "teachers", "student_groups", "rooms", "subjects", "semesters"]) {
      const { error } = await sb.from(t).delete().neq("id", ALL);
      if (error) throw new Error(`ลบข้อมูลเดิม ${t} ไม่สำเร็จ: ${error.message}`);
      log(`ลบข้อมูลเดิม: ${t}`);
    }
  }

  // ภาคเรียน: name เป็นคอลัมน์คำนวณ, is_active ตั้งทีหลังเพื่อไม่ให้ชนกัน
  const semesters = (T.semesters ?? []).map(({ name: _n, ...r }) => ({ ...r, is_active: false }));
  log(`ภาคเรียน: ${await upsert(sb, "semesters", semesters, log)} รายการ`);
  const active = (T.semesters ?? []).find((s) => s.is_active);
  if (active) await sb.rpc("set_active_semester", { p_semester: active.id });

  log(`รายวิชา: ${await upsert(sb, "subjects", T.subjects ?? [], log)} รายการ`);
  log(`ห้องเรียน: ${await upsert(sb, "rooms", T.rooms ?? [], log)} รายการ`);

  const groups = T.student_groups ?? [];
  // กลุ่มเรียนอ้างอิงกลุ่มคู่ขนานและครูที่ปรึกษา -> ใส่เป็น null ก่อน แล้วเติมหลังนำเข้าครู
  log(`กลุ่มนักเรียน: ${await upsert(sb, "student_groups", groups.map((g) => ({ ...g, parallel_ref_id: null, advisor_teacher_id: null })), log)} รายการ`);

  // ครู / นักเรียน: ถ้าบัญชีผู้ใช้ที่ผูกไว้ไม่มีแล้ว ให้ยกเลิกการผูก
  for (const [table, label] of [["teachers", "ครูผู้สอน"], ["students", "นักเรียน"]] as const) {
    const rows = T[table] ?? [];
    let ok = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      let { error } = await sb.from(table).upsert(chunk, { onConflict: "id" });
      if (error && /user_id|foreign key/i.test(error.message)) {
        log(`⚠ บางบัญชีผู้ใช้ของ${label}ไม่มีในระบบแล้ว — นำเข้าโดยไม่ผูกบัญชี`);
        ({ error } = await sb.from(table).upsert(chunk.map((r) => ({ ...r, user_id: null })), { onConflict: "id" }));
      }
      if (error) log(`⚠ ${table}: ${error.message}`); else ok += chunk.length;
    }
    log(`${label}: ${ok} รายการ`);
  }
  for (const g of groups.filter((x) => x.parallel_ref_id || x.advisor_teacher_id)) {
    await sb.from("student_groups").update({ parallel_ref_id: g.parallel_ref_id ?? null, advisor_teacher_id: g.advisor_teacher_id ?? null }).eq("id", g.id as string);
  }
  log(`ข้อมูลติดต่อนักเรียน: ${await upsert(sb, "student_contacts", T.student_contacts ?? [], log)} รายการ`);

  log(`ภาระงานสอน: ${await upsert(sb, "enrollments", T.enrollments ?? [], log)} รายการ`);
  log(`ตารางสอน: ${await upsert(sb, "schedules", (T.schedules ?? []).map((s) => ({ ...s, job_id: null })), log)} คาบ`);

  // ผู้ใช้: อัปเดตเฉพาะบัญชีที่ยังมีอยู่ (บัญชีล็อกอินจัดการโดย Supabase Auth)
  let pOk = 0;
  for (const p of T.profiles ?? []) {
    const { data } = await sb.from("profiles").update({
      role: p.role, full_name: p.full_name, student_group_id: p.student_group_id,
    }).eq("id", p.id as string).select("id");
    if (data?.length) pOk++;
  }
  log(`สิทธิ์ผู้ใช้: อัปเดต ${pOk} บัญชี`);

  if (T.data_requests?.length) {
    log(`คำร้อง PDPA: ${await upsert(sb, "data_requests", T.data_requests, () => {})} รายการ`);
  }
}

/** ส่งออกทุกตารางเป็น Excel (1 แท็บต่อ 1 ตาราง) */
export async function backupToExcel(b: BackupFile): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  for (const t of BACKUP_TABLES) {
    const rows = b.tables[t.table] ?? [];
    const ws = wb.addWorksheet(t.label.slice(0, 31));
    const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    ws.addRow(cols).font = { bold: true };
    rows.forEach((r) => ws.addRow(cols.map((c) => {
      const v = r[c];
      return v !== null && typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean | null);
    })));
    cols.forEach((_, i) => (ws.getColumn(i + 1).width = 18));
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
