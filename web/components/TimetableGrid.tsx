"use client";

import { IconLock } from "@/components/Icons";
import { usePrivacy } from "@/components/Preferences";
import { DAY_NAMES } from "@/lib/constants";
import type { ScheduleRow, SemesterConfig } from "@/lib/types";

export type ViewMode = "group" | "teacher" | "room";

export interface Session {
  key: string;
  rows: ScheduleRow[];
  day: number;
  start: number;
  end: number;
}

export const DAY_DOT: Record<number, string> = {
  1: "bg-amber-400", 2: "bg-rose-400", 3: "bg-emerald-500", 4: "bg-orange-400",
  5: "bg-sky-500", 6: "bg-purple-400", 7: "bg-red-400",
};

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
  const privacy = usePrivacy();
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
  const lunchIdx = periods.findIndex((p) => p.no === config.lunch_after_period);
  const lunchTime = lunchIdx >= 0 && periods[lunchIdx]?.end && periods[lunchIdx + 1]?.start
    ? ` (${periods[lunchIdx].end}–${periods[lunchIdx + 1].start})` : "";

  const blocked = new Map<string, string>();
  config.blocked.forEach((b) => b.periods.forEach((p) => blocked.set(`${b.day}|${p}`, b.label ?? "ห้ามจัด")));

  const info = (s: Session): [string, string | null] => {
    const r = s.rows[0];
    const groups = Array.from(new Set(s.rows.map((x) => x.group_code))).join(", ");
    if (mode === "group") return [privacy.name(r.teacher_name), r.room_code];
    if (mode === "teacher") return [groups, r.room_code];
    return [groups, null];
  };

  const cellBorder = "border-b border-r border-slate-200/80 dark:border-slate-800";

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
      <div
        className="grid min-w-[960px] bg-white text-xs dark:bg-slate-900"
        style={{
          gridTemplateColumns: `104px repeat(${totalCols - 1}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${config.days.length}, minmax(86px, auto))`,
        }}
      >
        {/* หัวตาราง */}
        <div className={`${cellBorder} flex items-center justify-center bg-slate-50 p-2 text-[11px] font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400`}
          style={{ gridColumn: 1, gridRow: 1 }}>
          วัน / คาบเรียน
        </div>
        {periods.map((p) => (
          <div key={p.no} className={`${cellBorder} bg-slate-50 px-1 py-2.5 text-center dark:bg-slate-800/60`}
            style={{ gridColumn: colOf.get(p.no), gridRow: 1 }}>
            <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">คาบ {p.no}</div>
            {p.start && <div className="mt-0.5 font-mono text-[10px] text-slate-400">{p.start}-{p.end}</div>}
          </div>
        ))}
        {lunchCol && (
          <div className={`${cellBorder} flex items-center justify-center bg-slate-100/70 text-[10px] font-medium text-slate-400 dark:bg-slate-800/40 dark:text-slate-500`}
            style={{ gridColumn: lunchCol, gridRow: `1 / span ${config.days.length + 1}`, writingMode: "vertical-rl" }}>
            พักกลางวัน{lunchTime}
          </div>
        )}

        {/* ช่องว่างสำหรับวาง */}
        {config.days.map((d, di) => (
          <div key={`day-${d}`} className="contents">
            <div className={`${cellBorder} flex items-center gap-2 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200`}
              style={{ gridColumn: 1, gridRow: di + 2 }}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${DAY_DOT[d]}`} />
              {DAY_NAMES[d]}
            </div>
            {periods.map((p) => {
              const bl = blocked.get(`${d}|${p.no}`);
              return (
                <div key={`${d}-${p.no}`}
                  className={`${cellBorder} ${bl ? "slot-blocked flex items-center justify-center" : ""} ${editable && !bl ? "transition-colors hover:bg-brand-50/40 dark:hover:bg-brand-500/5" : ""}`}
                  style={{ gridColumn: colOf.get(p.no), gridRow: di + 2 }}
                  onDragOver={(e) => { if (editable && !bl) e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const key = e.dataTransfer.getData("text/plain");
                    if (key) onDrop(key, d, p.no);
                  }}
                >
                  {bl && <span className="rounded bg-white/80 px-1.5 text-[10px] text-slate-400 dark:bg-slate-900/80">{bl}</span>}
                </div>
              );
            })}
          </div>
        ))}

        {/* การ์ดคาบเรียน */}
        {sessions.map((s) => {
          const di = config.days.indexOf(s.day);
          const c1 = colOf.get(s.start);
          const c2 = colOf.get(s.end);
          if (di < 0 || !c1 || !c2) return null;
          const r = s.rows[0];
          const [who, room] = info(s);
          const conflict = conflictKeys.has(s.key);
          const selected = selectedKey === s.key;
          return (
            <div key={s.key}
              draggable={editable}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", s.key)}
              onClick={() => onSelect(s)}
              className={`relative z-10 m-1 flex cursor-pointer flex-col overflow-hidden rounded-md border border-l-[3px] p-2 leading-snug shadow-sm transition hover:shadow-md
                ${conflict
                  ? "border-red-300 border-l-red-500 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10"
                  : "border-slate-200 border-l-brand-600 bg-white dark:border-slate-700 dark:border-l-brand-500 dark:bg-slate-800"}
                ${selected ? "ring-2 ring-brand-500/60" : ""}
                ${editable ? "active:cursor-grabbing" : ""}`}
              style={{ gridColumn: `${c1} / ${c2 + 1}`, gridRow: di + 2 }}
              title={`${r.subject_code} ${r.subject_name}`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="font-mono text-[11px] font-semibold text-slate-900 dark:text-white">{r.subject_code}</span>
                {r.is_locked && <span className="text-slate-400" title="ล็อกตำแหน่งแล้ว"><IconLock /></span>}
              </div>
              <div className="truncate text-[11px] font-medium text-slate-800 dark:text-slate-100">{r.subject_name}</div>
              <div className="mt-auto flex items-end justify-between gap-1 pt-1.5">
                <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{who}</span>
                {mode === "room" ? (
                  <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{privacy.name(r.teacher_name)}</span>
                ) : (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {room ? `ห้อง ${room}` : "ไม่ระบุห้อง"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
