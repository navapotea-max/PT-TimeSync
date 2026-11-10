"use client";

import { DAY_COLORS, DAY_NAMES } from "@/lib/constants";
import type { ScheduleRow, SemesterConfig } from "@/lib/types";

export type ViewMode = "group" | "teacher" | "room";

export interface Session {
  key: string;
  rows: ScheduleRow[];
  day: number;
  start: number;
  end: number;
}

export function toSessions(rows: ScheduleRow[]): Session[] {
  const m = new Map<string, Session>();
  for (const r of rows) {
    const s = m.get(r.session_key);
    if (s) s.rows.push(r);
    else m.set(r.session_key, { key: r.session_key, rows: [r], day: r.day_of_week, start: r.start_period, end: r.end_period });
  }
  return Array.from(m.values());
}

interface Props {
  config: SemesterConfig;
  sessions: Session[];
  mode: ViewMode;
  editable: boolean;
  conflictKeys: Set<string>;
  selectedKey: string | null;
  onSelect: (s: Session) => void;
  onDrop: (sessionKey: string, day: number, period: number) => void;
}

export default function TimetableGrid({ config, sessions, mode, editable, conflictKeys, selectedKey, onSelect, onDrop }: Props) {
  const periods = config.periods;
  // คอลัมน์: [วัน] [คาบ...] [พักกลางวัน] [คาบ...]
  const colOf = new Map<number, number>();
  let col = 2;
  let lunchCol: number | null = null;
  periods.forEach((p) => {
    colOf.set(p.no, col++);
    if (config.lunch_after_period != null && p.no === config.lunch_after_period) lunchCol = col++;
  });
  const totalCols = col - 1;
  const blocked = new Map<string, string>();
  config.blocked.forEach((b) => b.periods.forEach((p) => blocked.set(`${b.day}|${p}`, b.label ?? "ห้ามจัด")));

  const line2 = (s: Session) => {
    const r = s.rows[0];
    const groups = Array.from(new Set(s.rows.map((x) => x.group_code))).join(", ");
    if (mode === "group") return [r.teacher_name, r.room_code ?? "ไม่ระบุห้อง"];
    if (mode === "teacher") return [groups, r.room_code ?? "ไม่ระบุห้อง"];
    return [groups, r.teacher_name];
  };

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[900px] border-l border-t border-slate-300 text-xs"
        style={{
          gridTemplateColumns: `90px repeat(${totalCols - 1}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${config.days.length}, minmax(76px, auto))`,
        }}
      >
        {/* header */}
        <div className="border-b border-r border-slate-300 bg-slate-100 p-1 text-center font-semibold" style={{ gridColumn: 1, gridRow: 1 }}>
          วัน / คาบ
        </div>
        {periods.map((p) => (
          <div key={p.no} className="border-b border-r border-slate-300 bg-slate-100 p-1 text-center" style={{ gridColumn: colOf.get(p.no), gridRow: 1 }}>
            <div className="font-semibold">{p.no}</div>
            {p.start && <div className="text-[10px] text-slate-500">{p.start}-{p.end}</div>}
          </div>
        ))}
        {lunchCol && (
          <div className="flex items-center justify-center border-b border-r border-slate-300 bg-slate-200 p-1 text-center text-[10px]"
            style={{ gridColumn: lunchCol, gridRow: `1 / span ${config.days.length + 1}`, writingMode: "vertical-rl" }}>
            พักกลางวัน
          </div>
        )}

        {config.days.map((d, di) => (
          <div key={`day-${d}`} className="contents">
            <div className={`flex items-center justify-center border-b border-r border-slate-300 font-semibold ${DAY_COLORS[d]}`}
              style={{ gridColumn: 1, gridRow: di + 2 }}>
              {DAY_NAMES[d]}
            </div>
            {periods.map((p) => {
              const bl = blocked.get(`${d}|${p.no}`);
              return (
                <div key={`${d}-${p.no}`}
                  className={`border-b border-r border-slate-300 ${bl ? "bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_6px,#e2e8f0_6px,#e2e8f0_12px)]" : ""}`}
                  style={{ gridColumn: colOf.get(p.no), gridRow: di + 2 }}
                  onDragOver={(e) => { if (editable && !bl) e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const key = e.dataTransfer.getData("text/plain");
                    if (key) onDrop(key, d, p.no);
                  }}
                >
                  {bl && <span className="block p-1 text-[10px] text-slate-500">{bl}</span>}
                </div>
              );
            })}
          </div>
        ))}

        {/* sessions */}
        {sessions.map((s) => {
          const di = config.days.indexOf(s.day);
          const c1 = colOf.get(s.start);
          const c2 = colOf.get(s.end);
          if (di < 0 || !c1 || !c2) return null;
          const r = s.rows[0];
          const [a, b] = line2(s);
          const conflict = conflictKeys.has(s.key);
          return (
            <div key={s.key}
              draggable={editable}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", s.key)}
              onClick={() => onSelect(s)}
              className={`z-10 m-0.5 cursor-pointer overflow-hidden rounded border p-1 leading-tight shadow-sm
                ${conflict ? "border-red-500 bg-red-50 ring-2 ring-red-400" : r.status === "published" ? "border-green-400 bg-green-50" : "border-brand-500/40 bg-white"}
                ${selectedKey === s.key ? "ring-2 ring-brand-500" : ""}`}
              style={{ gridColumn: `${c1} / ${c2 + 1}`, gridRow: di + 2 }}
              title={`${r.subject_code} ${r.subject_name}`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-semibold">{r.subject_code}</span>
                {r.is_locked && <span title="ล็อกไว้">🔒</span>}
              </div>
              <div className="truncate">{r.subject_name}</div>
              <div className="truncate text-slate-600">{a}</div>
              <div className="truncate text-slate-500">{b}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
