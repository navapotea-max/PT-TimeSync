/** เวอร์ชันของนโยบายความเป็นส่วนตัว — เปลี่ยนเลขเมื่อแก้ไขนโยบาย ผู้ใช้จะถูกขอความยินยอมใหม่ */
export const PDPA_VERSION = "1.0";

export const ORG = {
  name: "วิทยาลัยการอาชีพโพนทอง",
  address: "อำเภอโพนทอง จังหวัดร้อยเอ็ด",
  // TODO: แก้เป็นช่องทางติดต่อจริงของเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO)
  dpoContact: "งานศูนย์ข้อมูลสารสนเทศ วิทยาลัยการอาชีพโพนทอง",
  retention: "ตลอดระยะเวลาที่ท่านเป็นบุคลากรหรือนักเรียนนักศึกษาของวิทยาลัย และอีกไม่เกิน 1 ปีการศึกษาหลังจากนั้น",
};

export const REQUEST_TYPES: Record<string, string> = {
  access: "ขอเข้าถึง/ขอสำเนาข้อมูล",
  correction: "ขอแก้ไขข้อมูลให้ถูกต้อง",
  deletion: "ขอลบข้อมูล/ลบบัญชี",
  withdraw_consent: "ขอถอนความยินยอม",
  other: "อื่น ๆ",
};

export const REQUEST_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "รอดำเนินการ", cls: "bg-amber-100 text-amber-800" },
  in_progress: { label: "กำลังดำเนินการ", cls: "bg-sky-100 text-slate-800" },
  completed: { label: "เสร็จสิ้น", cls: "bg-green-100 text-green-800" },
  rejected: { label: "ปฏิเสธ", cls: "bg-red-100 text-red-800" },
};
