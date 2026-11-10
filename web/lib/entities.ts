import { ROOM_TYPES } from "./constants";
import { ACADEMIC_STANDINGS, PREFIXES, STUDENT_STATUS, TEACHER_POSITIONS } from "./people";

const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

export type FieldType = "text" | "number" | "boolean" | "select" | "fk" | "json" | "intarray" | "date";

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  fk?: { table: string; labelCols: string[]; order: string };
  help?: string;
  hideInTable?: boolean;
  /** ข้อมูลส่วนบุคคล — ถูกปิดบังเมื่อเปิดโหมด PDPA */
  pii?: "name" | "email" | "phone";
}

export interface Lookup {
  /** ชื่อคอลัมน์ในไฟล์ CSV */
  column: string;
  /** ตารางที่ใช้ค้นหา */
  table: string;
  /** คอลัมน์ในตารางที่ใช้จับคู่ */
  match: string;
  /** คอลัมน์ปลายทางที่จะเก็บ id */
  target: string;
  required?: boolean;
}

export interface Entity {
  key: string;
  table: string;
  title: string;
  orderBy: string;
  fields: Field[];
  /** ใช้ตรวจข้อมูลซ้ำ และเป็น onConflict ตอน upsert */
  uniqueKey: string[];
  importColumns: string[];
  lookups?: Lookup[];
  sample: string;
}

export const ENTITIES: Record<string, Entity> = {
  semesters: {
    key: "semesters",
    table: "semesters",
    title: "ภาคเรียน",
    orderBy: "academic_year",
    uniqueKey: ["academic_year", "term"],
    fields: [
      { key: "academic_year", label: "ปีการศึกษา (พ.ศ.)", type: "number", required: true },
      { key: "term", label: "ภาคเรียน", type: "select", required: true,
        options: [{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3 (ฤดูร้อน)" }] },
      { key: "start_date", label: "วันเปิดภาค", type: "date" },
      { key: "end_date", label: "วันปิดภาค", type: "date" },
      { key: "is_active", label: "ภาคเรียนปัจจุบัน", type: "boolean" },
      { key: "config", label: "ตั้งค่าคาบเรียน (JSON)", type: "json", hideInTable: true,
        help: "days = วันที่มีเรียน, periods = คาบ, lunch_after_period = พักหลังคาบที่, blocked = คาบที่ห้ามจัด" },
    ],
    importColumns: ["academic_year", "term", "start_date", "end_date"],
    sample: "academic_year,term,start_date,end_date\n2568,2,2025-11-01,2026-03-15",
  },
  teachers: {
    key: "teachers",
    table: "teachers",
    title: "ครูผู้สอน",
    orderBy: "teacher_code",
    uniqueKey: ["teacher_code"],
    fields: [
      { key: "teacher_code", label: "รหัสครู", type: "text", required: true },
      { key: "name", label: "ชื่อ-สกุล", type: "text", required: true, pii: "name" },
      { key: "email", label: "อีเมล (ใช้ผูกบัญชีล็อกอิน)", type: "text", pii: "email" },
      { key: "department", label: "แผนกวิชา", type: "text" },
      { key: "position", label: "ตำแหน่ง", type: "select", options: opts(TEACHER_POSITIONS) },
      { key: "academic_standing", label: "วิทยฐานะ", type: "select", options: opts(ACADEMIC_STANDINGS), hideInTable: true },
      { key: "education", label: "วุฒิการศึกษา", type: "text", hideInTable: true },
      { key: "phone", label: "เบอร์ติดต่อ", type: "text", pii: "phone", hideInTable: true },
      { key: "max_hours_per_week", label: "คาบสอนสูงสุด/สัปดาห์", type: "number" },
      { key: "unavailable_times", label: "เวลาที่ไม่สะดวกสอน", type: "json", hideInTable: true,
        help: 'เช่น [{"day":1,"periods":[1,2]}] หรือแก้ไขแบบตารางที่เมนู "เวลาไม่สะดวกสอน"' },
    ],
    importColumns: ["teacher_code", "name", "email", "department", "position", "academic_standing", "education", "phone", "max_hours_per_week", "unavailable_times"],
    sample:
      'teacher_code,name,email,department,position,academic_standing,education,phone,max_hours_per_week,unavailable_times\nT13,ครูตัวอย่าง ทดสอบ,t13@example.com,ช่างยนต์,ครู,ชำนาญการ,ค.อ.บ. เครื่องกล,080-000-0000,22,"1:1-2;5:5-8"',
  },
  rooms: {
    key: "rooms",
    table: "rooms",
    title: "ห้องเรียน",
    orderBy: "room_code",
    uniqueKey: ["room_code"],
    fields: [
      { key: "room_code", label: "รหัสห้อง", type: "text", required: true },
      { key: "room_name", label: "ชื่อห้อง", type: "text", required: true },
      { key: "room_type", label: "ประเภทห้อง", type: "select", options: ROOM_TYPES, required: true },
      { key: "capacity", label: "ความจุ (คน)", type: "number", required: true },
      { key: "building", label: "อาคาร", type: "text" },
    ],
    importColumns: ["room_code", "room_name", "room_type", "capacity", "building"],
    sample: "room_code,room_name,room_type,capacity,building\n114,ห้องทฤษฎี 114,theory,40,อาคาร 1",
  },
  subjects: {
    key: "subjects",
    table: "subjects",
    title: "รายวิชา",
    orderBy: "subject_code",
    uniqueKey: ["subject_code"],
    fields: [
      { key: "subject_code", label: "รหัสวิชา", type: "text", required: true },
      { key: "subject_name", label: "ชื่อวิชา", type: "text", required: true },
      { key: "theory_hours", label: "ท. (ชม.)", type: "number", required: true },
      { key: "lab_hours", label: "ป. (ชม.)", type: "number", required: true },
      { key: "credits", label: "หน่วยกิต", type: "number" },
      { key: "required_room_type", label: "ประเภทห้องที่ต้องใช้", type: "select", options: ROOM_TYPES, required: true },
      { key: "department", label: "แผนกวิชา", type: "text" },
    ],
    importColumns: ["subject_code", "subject_name", "theory_hours", "lab_hours", "credits", "required_room_type", "department"],
    sample:
      "subject_code,subject_name,theory_hours,lab_hours,credits,required_room_type,department\n20001-1001,อาชีวอนามัยและความปลอดภัย,1,0,1,theory,สามัญสัมพันธ์",
  },
  student_groups: {
    key: "student_groups",
    table: "student_groups",
    title: "กลุ่มนักเรียน",
    orderBy: "group_code",
    uniqueKey: ["group_code"],
    fields: [
      { key: "group_code", label: "รหัสกลุ่ม", type: "text", required: true },
      { key: "group_name", label: "ชื่อกลุ่ม", type: "text", required: true },
      { key: "department", label: "แผนกวิชา", type: "text" },
      { key: "level", label: "ระดับชั้น", type: "text", help: "เช่น ปวช.1, ปวส.1" },
      { key: "student_count", label: "จำนวนนักเรียน", type: "number", required: true },
      { key: "is_parallel", label: "กลุ่มคู่ขนาน", type: "boolean" },
      { key: "parallel_ref_id", label: "เรียนรวมกับกลุ่ม", type: "fk",
        fk: { table: "student_groups", labelCols: ["group_code"], order: "group_code" } },
      { key: "advisor_teacher_id", label: "ครูที่ปรึกษา", type: "fk", pii: "name",
        fk: { table: "teachers", labelCols: ["teacher_code", "name"], order: "teacher_code" } },
    ],
    importColumns: ["group_code", "group_name", "department", "level", "student_count", "is_parallel", "parallel_ref_code", "advisor_teacher_code"],
    lookups: [
      { column: "parallel_ref_code", table: "student_groups", match: "group_code", target: "parallel_ref_id" },
      { column: "advisor_teacher_code", table: "teachers", match: "teacher_code", target: "advisor_teacher_id" },
    ],
    sample:
      "group_code,group_name,department,level,student_count,is_parallel,parallel_ref_code,advisor_teacher_code\nชฟ.1/2,ปวช.1 ช่างไฟฟ้ากำลัง กลุ่ม 2,ช่างไฟฟ้ากำลัง,ปวช.1,30,true,ชฟ.1/1,T03",
  },
  students: {
    key: "students",
    table: "students",
    title: "นักเรียน",
    orderBy: "student_code",
    uniqueKey: ["student_code"],
    fields: [
      { key: "student_code", label: "รหัสนักเรียน", type: "text", required: true },
      { key: "prefix", label: "คำนำหน้า", type: "select", options: opts(PREFIXES) },
      { key: "first_name", label: "ชื่อ", type: "text", required: true, pii: "name" },
      { key: "last_name", label: "นามสกุล", type: "text", required: true, pii: "name" },
      { key: "nickname", label: "ชื่อเล่น", type: "text", hideInTable: true },
      { key: "student_group_id", label: "กลุ่มเรียน", type: "fk",
        fk: { table: "student_groups", labelCols: ["group_code"], order: "group_code" } },
      { key: "email", label: "อีเมล (ใช้ผูกบัญชีล็อกอิน)", type: "text", pii: "email", hideInTable: true },
      { key: "entry_year", label: "ปีที่เข้าศึกษา", type: "number" },
      { key: "status", label: "สถานะ", type: "select", required: true,
        options: Object.entries(STUDENT_STATUS).map(([value, v]) => ({ value, label: v.label })) },
    ],
    importColumns: ["student_code", "prefix", "first_name", "last_name", "nickname", "group_code", "email", "entry_year", "status"],
    lookups: [{ column: "group_code", table: "student_groups", match: "group_code", target: "student_group_id" }],
    sample:
      "student_code,prefix,first_name,last_name,nickname,group_code,email,entry_year,status\n68201999,นาย,ตัวอย่าง,ทดสอบ,ต้น,ชย.1/1,std68201999@example.com,2568,studying",
  },
  enrollments: {
    key: "enrollments",
    table: "enrollments",
    title: "ภาระงานสอน",
    orderBy: "created_at",
    uniqueKey: ["semester_id", "student_group_id", "subject_id"],
    fields: [
      { key: "semester_id", label: "ภาคเรียน", type: "fk", required: true,
        fk: { table: "semesters", labelCols: ["name"], order: "academic_year" } },
      { key: "student_group_id", label: "กลุ่มนักเรียน", type: "fk", required: true,
        fk: { table: "student_groups", labelCols: ["group_code"], order: "group_code" } },
      { key: "subject_id", label: "รายวิชา", type: "fk", required: true,
        fk: { table: "subjects", labelCols: ["subject_code", "subject_name"], order: "subject_code" } },
      { key: "teacher_id", label: "ครูผู้สอน", type: "fk", required: true,
        fk: { table: "teachers", labelCols: ["teacher_code", "name"], order: "teacher_code" }, pii: "name" },
      { key: "total_hours_required", label: "คาบ/สัปดาห์", type: "number", help: "เว้นว่าง = ท.+ป. ของรายวิชา" },
      { key: "block_sizes", label: "แบ่งก้อนคาบ", type: "intarray", help: "เช่น 4,3 (เว้นว่าง = อัตโนมัติ)" },
      { key: "preferred_room_id", label: "ห้องที่ต้องการ", type: "fk",
        fk: { table: "rooms", labelCols: ["room_code", "room_name"], order: "room_code" } },
      { key: "note", label: "หมายเหตุ", type: "text", hideInTable: true },
    ],
    importColumns: ["semester", "group_code", "subject_code", "teacher_code", "total_hours_required", "block_sizes", "preferred_room_code"],
    lookups: [
      { column: "semester", table: "semesters", match: "name", target: "semester_id", required: true },
      { column: "group_code", table: "student_groups", match: "group_code", target: "student_group_id", required: true },
      { column: "subject_code", table: "subjects", match: "subject_code", target: "subject_id", required: true },
      { column: "teacher_code", table: "teachers", match: "teacher_code", target: "teacher_id", required: true },
      { column: "preferred_room_code", table: "rooms", match: "room_code", target: "preferred_room_id" },
    ],
    sample:
      "semester,group_code,subject_code,teacher_code,total_hours_required,block_sizes,preferred_room_code\n1/2568,ชย.1/1,20000-1101,T08,,,",
  },
};

export const IMPORTABLE = ["teachers", "students", "rooms", "subjects", "student_groups", "enrollments", "semesters"];

/** "1:1-2;5:5-8"  หรือ JSON  ->  [{day:1,periods:[1,2]},{day:5,periods:[5,6,7,8]}] */
export function parseUnavailable(v: string): { day: number; periods: number[] }[] {
  const s = v.trim();
  if (!s) return [];
  if (s.startsWith("[")) return JSON.parse(s);
  return s.split(";").filter(Boolean).map((part) => {
    const [d, ps] = part.split(":");
    const periods: number[] = [];
    for (const seg of (ps ?? "").split(",")) {
      const [a, b] = seg.split("-").map((x) => parseInt(x, 10));
      if (Number.isNaN(a)) continue;
      for (let p = a; p <= (Number.isNaN(b) || b === undefined ? a : b); p++) periods.push(p);
    }
    return { day: parseInt(d, 10), periods };
  });
}

/** แปลงค่าข้อความ (จาก CSV/ฟอร์ม) ให้เป็นชนิดข้อมูลที่ถูกต้อง */
export function coerce(field: Field | undefined, raw: unknown): unknown {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return raw;
  const v = raw.trim();
  if (v === "") return field?.type === "boolean" ? false : null;
  switch (field?.type) {
    case "number": {
      const n = Number(v);
      if (Number.isNaN(n)) throw new Error(`"${v}" ไม่ใช่ตัวเลข`);
      return n;
    }
    case "boolean":
      return ["true", "1", "y", "yes", "ใช่", "t"].includes(v.toLowerCase());
    case "json":
      return field.key === "unavailable_times" ? parseUnavailable(v) : JSON.parse(v);
    case "intarray":
      return v.replace(/[{}\[\]\s]/g, "").split(",").filter(Boolean).map((x) => {
        const n = parseInt(x, 10);
        if (Number.isNaN(n)) throw new Error(`"${v}" ต้องเป็นตัวเลขคั่นด้วย ,`);
        return n;
      });
    default:
      return v;
  }
}
