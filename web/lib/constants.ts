import type { SemesterConfig } from "./types";

export const DAY_NAMES: Record<number, string> = {
  1: "จันทร์",
  2: "อังคาร",
  3: "พุธ",
  4: "พฤหัสบดี",
  5: "ศุกร์",
  6: "เสาร์",
  7: "อาทิตย์",
};

export const DAY_COLORS: Record<number, string> = {
  1: "bg-yellow-100",
  2: "bg-pink-100",
  3: "bg-green-100",
  4: "bg-orange-100",
  5: "bg-sky-100",
  6: "bg-purple-100",
  7: "bg-red-100",
};

export const ROOM_TYPES: { value: string; label: string }[] = [
  { value: "theory", label: "ห้องทฤษฎี" },
  { value: "computer_lab", label: "ห้องปฏิบัติการคอมพิวเตอร์" },
  { value: "workshop_auto", label: "โรงฝึกงานช่างยนต์" },
  { value: "workshop_basic", label: "โรงฝึกงานพื้นฐาน/ช่างกล" },
  { value: "electrical_lab", label: "ห้องปฏิบัติการไฟฟ้า" },
  { value: "electronics_lab", label: "ห้องปฏิบัติการอิเล็กทรอนิกส์" },
  { value: "welding_shop", label: "โรงฝึกงานเชื่อมโลหะ" },
  { value: "gym", label: "สนาม/โรงยิม" },
];

export const roomTypeLabel = (v: string | null | undefined) =>
  ROOM_TYPES.find((r) => r.value === v)?.label ?? v ?? "-";

export const DEFAULT_CONFIG: SemesterConfig = {
  days: [1, 2, 3, 4, 5],
  periods: [
    { no: 1, start: "08:00", end: "09:00" },
    { no: 2, start: "09:00", end: "10:00" },
    { no: 3, start: "10:00", end: "11:00" },
    { no: 4, start: "11:00", end: "12:00" },
    { no: 5, start: "13:00", end: "14:00" },
    { no: 6, start: "14:00", end: "15:00" },
    { no: 7, start: "15:00", end: "16:00" },
    { no: 8, start: "16:00", end: "17:00" },
  ],
  lunch_after_period: 4,
  blocked: [{ day: 3, periods: [7, 8], label: "กิจกรรม" }],
  max_periods_per_day_group: 8,
};

export function configOf(s: { config?: SemesterConfig | null } | null | undefined): SemesterConfig {
  return { ...DEFAULT_CONFIG, ...(s?.config ?? {}) };
}

export const ENGINE_URL = (process.env.NEXT_PUBLIC_ENGINE_URL ?? "http://localhost:8000").trim().replace(/\/(health)?\/?$/, "");
