"""ลำดับการทำงานของงานจัดตาราง: โหลดข้อมูล -> สร้างโมเดล -> คำนวณ -> บันทึกผล (พร้อมรายงานความคืบหน้าแบบ Realtime)"""

from __future__ import annotations

import logging
import time
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

from .builder import build
from .config import get_settings
from .db import fetch_all, get_client
from .solver import solve

log = logging.getLogger("engine")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobReporter:
    """เขียนสถานะลงตาราง schedule_jobs -> Supabase Realtime ส่งต่อไปยังหน้าเว็บทันที"""

    def __init__(self, job_id: str) -> None:
        self.job_id = job_id
        self._last = 0.0
        self._last_pct = -1

    def update(self, **fields: Any) -> None:
        get_client().table("schedule_jobs").update(fields).eq("id", self.job_id).execute()

    def progress(self, pct: int, message: str, force: bool = False) -> None:
        now = time.time()
        if not force and pct == self._last_pct and now - self._last < 1.5:
            return
        self._last, self._last_pct = now, pct
        try:
            self.update(progress=max(0, min(100, pct)), message=message)
        except Exception:  # ไม่ให้การรายงานผลทำให้งานล้ม
            log.exception("progress update failed")


def run_job(job_id: str, semester_id: str, time_limit: int) -> None:
    rep = JobReporter(job_id)
    sb = get_client()
    try:
        rep.update(status="running", started_at=_now(), progress=2, message="เริ่มงาน")
        rep.progress(5, "กำลังโหลดข้อมูลจากฐานข้อมูล", force=True)

        semester = sb.table("semesters").select("*").eq("id", semester_id).single().execute().data
        enrollments = fetch_all("enrollments", semester_id=semester_id)
        subjects = {r["id"]: r for r in fetch_all("subjects")}
        teachers = {r["id"]: r for r in fetch_all("teachers")}
        rooms = fetch_all("rooms")
        groups = {r["id"]: r for r in fetch_all("student_groups")}
        locked = [r for r in fetch_all("schedules", semester_id=semester_id) if r.get("is_locked")]

        if not enrollments:
            raise ValueError("ภาคเรียนนี้ยังไม่มีข้อมูลภาระงานสอน (enrollments)")

        rep.progress(12, f"ตรวจสอบข้อมูล: {len(enrollments)} ภาระงาน, {len(teachers)} ครู, {len(rooms)} ห้อง", force=True)
        built = build(semester, enrollments, subjects, teachers, rooms, groups, locked)
        if built.errors:
            _fail(rep, "ข้อมูลไม่ผ่านการตรวจสอบเบื้องต้น", {"errors": built.errors, "warnings": built.warnings})
            return

        result = solve(
            built.data,
            time_limit=time_limit,
            progress=lambda p, m: rep.progress(p, m),
            workers=get_settings().solver_workers,
        )
        if not result.ok:
            _fail(rep, result.message, {
                "status": result.status, "errors": result.problems, "warnings": built.warnings,
                "wall_time": result.wall_time,
            })
            return

        rep.progress(92, "กำลังบันทึกผลลงตาราง schedules", force=True)
        sb.table("schedules").delete().eq("semester_id", semester_id).eq("is_locked", False).execute()
        rows = []
        for pl in result.placements:
            key = str(uuid.uuid4())
            for enr_id in pl.block.enrollment_ids:
                rows.append({
                    "semester_id": semester_id,
                    "enrollment_id": enr_id,
                    "room_id": pl.room_id,
                    "day_of_week": pl.day,
                    "start_period": pl.start,
                    "end_period": pl.end,
                    "status": "draft",
                    "is_locked": False,
                    "session_key": key,
                    "job_id": job_id,
                })
        for i in range(0, len(rows), 500):
            sb.table("schedules").insert(rows[i : i + 500]).execute()

        rep.update(
            status="succeeded",
            progress=100,
            message=result.message,
            finished_at=_now(),
            result={
                "status": result.status,
                "blocks": len(result.placements),
                "rows": len(rows),
                "locked_kept": len(locked),
                "objective": result.objective,
                "wall_time": round(result.wall_time, 2),
                "variables": result.num_variables,
                "warnings": built.warnings,
            },
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("job failed")
        _fail(rep, f"เกิดข้อผิดพลาด: {exc}", {"trace": traceback.format_exc()[-2000:]})


def _fail(rep: JobReporter, message: str, result: dict[str, Any]) -> None:
    try:
        rep.update(status="failed", message=message, finished_at=_now(), result=result)
    except Exception:
        log.exception("could not mark job failed")
