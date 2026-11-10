import type { ScheduleRow } from "./types";

export interface Conflict {
  kind: "teacher" | "group" | "room";
  day: number;
  period: number;
  label: string;
  sessionKeys: string[];
}

/** ตรวจการชนกันของตาราง: ครู / กลุ่ม / ห้อง ที่ถูกใช้ในคาบเดียวกันโดยคนละ session */
export function findConflicts(rows: ScheduleRow[], maskName: (v: string) => string = (v) => v): Conflict[] {
  const maps = {
    teacher: new Map<string, Set<string>>(),
    group: new Map<string, Set<string>>(),
    room: new Map<string, Set<string>>(),
  };
  const labels = new Map<string, string>();
  for (const r of rows) {
    for (let p = r.start_period; p <= r.end_period; p++) {
      const add = (kind: keyof typeof maps, id: string | null, label: string) => {
        if (!id) return;
        const k = `${id}|${r.day_of_week}|${p}`;
        if (!maps[kind].has(k)) maps[kind].set(k, new Set());
        maps[kind].get(k)!.add(r.session_key);
        labels.set(`${kind}|${k}`, label);
      };
      add("teacher", r.teacher_id, `ครู ${maskName(r.teacher_name)}`);
      add("group", r.student_group_id, `กลุ่ม ${r.group_code}`);
      add("room", r.room_id, `ห้อง ${r.room_code ?? ""}`);
    }
  }
  const out: Conflict[] = [];
  (Object.keys(maps) as (keyof typeof maps)[]).forEach((kind) => {
    maps[kind].forEach((keys, k) => {
      if (keys.size > 1) {
        const [, day, period] = k.split("|");
        out.push({
          kind,
          day: Number(day),
          period: Number(period),
          label: labels.get(`${kind}|${k}`) ?? "",
          sessionKeys: Array.from(keys),
        });
      }
    });
  });
  return out;
}

/** ตรวจว่าถ้าย้าย session ไปที่ day/start/room แล้วจะชนกับอะไรบ้าง */
export function conflictsForMove(
  all: ScheduleRow[],
  sessionKey: string,
  day: number,
  start: number,
  end: number,
  roomId: string | null,
): string[] {
  const moving = all.filter((r) => r.session_key === sessionKey);
  if (!moving.length) return [];
  const teacher = moving[0].teacher_id;
  const groups = new Set(moving.map((r) => r.student_group_id));
  const msgs = new Set<string>();
  for (const r of all) {
    if (r.session_key === sessionKey || r.day_of_week !== day) continue;
    if (r.end_period < start || r.start_period > end) continue;
    if (r.teacher_id === teacher) msgs.add(`ครู ${r.teacher_name} สอน ${r.subject_code} (${r.group_code}) อยู่แล้ว`);
    if (groups.has(r.student_group_id)) msgs.add(`กลุ่ม ${r.group_code} เรียน ${r.subject_code} อยู่แล้ว`);
    if (roomId && r.room_id === roomId) msgs.add(`ห้อง ${r.room_code} ถูกใช้โดย ${r.subject_code} (${r.group_code})`);
  }
  return Array.from(msgs);
}
