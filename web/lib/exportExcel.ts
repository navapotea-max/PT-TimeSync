import type { ScheduleRow, SemesterConfig } from "./types";
import { DAY_NAMES } from "./constants";

export interface SheetSpec {
  title: string; // ชื่อแท็บ / หัวตาราง
  subtitle: string;
  rows: ScheduleRow[];
  cellText: (rows: ScheduleRow[]) => string;
}

/** สร้างไฟล์ Excel ตารางเรียน: 1 sheet ต่อ 1 กลุ่ม/ครู/ห้อง */
export async function buildWorkbook(config: SemesterConfig, sheets: SheetSpec[], heading: string): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "ระบบจัดตารางสอน วิทยาลัยการอาชีพโพนทอง";
  const used = new Set<string>();

  for (const sh of sheets) {
    let name = sh.title.replace(/[\\/*?:[\]]/g, "-").slice(0, 31) || "Sheet";
    while (used.has(name)) name = name.slice(0, 28) + "_" + used.size;
    used.add(name);
    const ws = wb.addWorksheet(name, { pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1 } });

    const periods = config.periods;
    const nCols = periods.length + 1;
    ws.mergeCells(1, 1, 1, nCols);
    ws.getCell(1, 1).value = heading;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.getCell(1, 1).alignment = { horizontal: "center" };
    ws.mergeCells(2, 1, 2, nCols);
    ws.getCell(2, 1).value = sh.subtitle;
    ws.getCell(2, 1).alignment = { horizontal: "center" };

    const header = ws.getRow(4);
    header.getCell(1).value = "วัน / คาบ";
    periods.forEach((p, i) => {
      header.getCell(i + 2).value = `คาบ ${p.no}${p.start ? `\n${p.start}-${p.end}` : ""}`;
    });
    header.height = 32;

    const colOf = new Map(periods.map((p, i) => [p.no, i + 2]));
    config.days.forEach((d, di) => {
      const rowNo = 5 + di;
      const row = ws.getRow(rowNo);
      row.height = 60;
      row.getCell(1).value = DAY_NAMES[d];
      const sessions = new Map<string, ScheduleRow[]>();
      sh.rows.filter((r) => r.day_of_week === d).forEach((r) => {
        sessions.set(r.session_key, [...(sessions.get(r.session_key) ?? []), r]);
      });
      config.blocked.filter((b) => b.day === d).forEach((b) => {
        b.periods.forEach((p) => { const c = colOf.get(p); if (c) row.getCell(c).value = b.label ?? "-"; });
      });
      sessions.forEach((rs) => {
        const c1 = colOf.get(rs[0].start_period);
        const c2 = colOf.get(rs[0].end_period);
        if (!c1 || !c2) return;
        try { if (c2 > c1) ws.mergeCells(rowNo, c1, rowNo, c2); } catch { /* ช่องชนกัน */ }
        row.getCell(c1).value = sh.cellText(rs);
      });
    });

    ws.getColumn(1).width = 12;
    for (let c = 2; c <= nCols; c++) ws.getColumn(c).width = 16;
    for (let r = 4; r < 5 + config.days.length; r++) {
      for (let c = 1; c <= nCols; c++) {
        const cell = ws.getCell(r, c);
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
        if (r === 4 || c === 1) cell.font = { bold: true };
        if (r === 4) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      }
    }

    // สรุปรายวิชา
    let r = 6 + config.days.length;
    ws.getCell(r, 1).value = "สรุปรายวิชา";
    ws.getCell(r, 1).font = { bold: true };
    const bySubject = new Map<string, { code: string; name: string; teacher: string; groups: Set<string>; hours: number; seen: Set<string> }>();
    sh.rows.forEach((x) => {
      const k = `${x.subject_code}|${x.teacher_name}`;
      const s = bySubject.get(k) ?? { code: x.subject_code, name: x.subject_name, teacher: x.teacher_name, groups: new Set(), hours: 0, seen: new Set() };
      s.groups.add(x.group_code);
      if (!s.seen.has(x.session_key)) { s.hours += x.end_period - x.start_period + 1; s.seen.add(x.session_key); }
      bySubject.set(k, s);
    });
    bySubject.forEach((s) => {
      r++;
      ws.getCell(r, 1).value = s.code;
      ws.getCell(r, 2).value = s.name;
      ws.getCell(r, 5).value = `${s.hours} คาบ`;
      ws.getCell(r, 6).value = s.teacher;
      ws.getCell(r, 8).value = Array.from(s.groups).join(", ");
    });
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
