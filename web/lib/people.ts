import type { StudentStatus } from "./types";

export const STUDENT_STATUS: Record<StudentStatus, { label: string; cls: string }> = {
  studying: { label: "กำลังศึกษา", cls: "chip-green" },
  suspended: { label: "พักการเรียน", cls: "chip-amber" },
  graduated: { label: "สำเร็จการศึกษา", cls: "chip-blue" },
  resigned: { label: "ลาออก", cls: "chip-gray" },
};

export const PREFIXES = ["นาย", "นางสาว", "นาง", "เด็กชาย", "เด็กหญิง"];
export const TEACHER_POSITIONS = ["ครู", "ครูผู้ช่วย", "พนักงานราชการ (ครู)", "ครูอัตราจ้าง", "ครูพิเศษสอน"];
export const ACADEMIC_STANDINGS = ["ชำนาญการ", "ชำนาญการพิเศษ", "เชี่ยวชาญ", "เชี่ยวชาญพิเศษ"];
export const PARENT_RELATIONS = ["บิดา", "มารดา", "ผู้ปกครอง", "ปู่/ย่า/ตา/ยาย", "ญาติ"];

/** อายุ (ปี) จากวันเกิด */
export function ageFrom(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}

/** วันที่แบบไทย เช่น 4 มี.ค. 2552 */
export const thaiDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "-";
