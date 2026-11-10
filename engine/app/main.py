"""AI Scheduling Engine (FastAPI) — วิทยาลัยการอาชีพโพนทอง"""

import logging
import threading

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import get_settings
from .db import get_client, verify_user
from .runner import run_job

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()
app = FastAPI(title="Phonthong Timetable AI Engine", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


class JobRequest(BaseModel):
    semester_id: str
    time_limit_seconds: int | None = Field(default=None, ge=5)


@app.get("/")
@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "timetable-engine"}


def _require_admin(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "ต้องแนบ Authorization: Bearer <access_token>")
    profile = verify_user(authorization.split(" ", 1)[1])
    if not profile:
        raise HTTPException(401, "token ไม่ถูกต้องหรือหมดอายุ")
    if profile.get("role") != "admin":
        raise HTTPException(403, "เฉพาะผู้ดูแลระบบเท่านั้น")
    return profile


@app.post("/jobs", status_code=202)
def create_job(req: JobRequest, authorization: str | None = Header(default=None)) -> dict:
    profile = _require_admin(authorization)
    sb = get_client()

    sem = sb.table("semesters").select("id").eq("id", req.semester_id).limit(1).execute().data
    if not sem:
        raise HTTPException(404, "ไม่พบภาคเรียน")
    running = (
        sb.table("schedule_jobs").select("id")
        .eq("semester_id", req.semester_id).in_("status", ["queued", "running"]).execute().data
    )
    if running:
        raise HTTPException(409, "มีงานจัดตารางของภาคเรียนนี้กำลังทำงานอยู่")

    time_limit = min(req.time_limit_seconds or settings.default_time_limit, settings.max_time_limit)
    job = sb.table("schedule_jobs").insert({
        "semester_id": req.semester_id,
        "requested_by": profile["id"],
        "status": "queued",
        "progress": 0,
        "message": "อยู่ในคิว",
        "params": {"time_limit_seconds": time_limit},
    }).execute().data[0]

    threading.Thread(target=run_job, args=(job["id"], req.semester_id, time_limit), daemon=True).start()
    return {"job_id": job["id"], "status": "queued"}
