"""แปลงข้อมูลดิบจากฐานข้อมูล -> SolverInput (ฟังก์ชันบริสุทธิ์ ทดสอบได้โดยไม่ต้องต่อฐานข้อมูล)"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from .solver import Block, FixedPlacement, Room, SolverInput, TimeGrid, split_hours

DEFAULT_CONFIG: dict[str, Any] = {
    "days": [1, 2, 3, 4, 5],
    "periods": [{"no": i} for i in range(1, 9)],
    "lunch_after_period": 4,
    "blocked": [],
    "max_periods_per_day_group": 8,
}


@dataclass
class BuildResult:
    data: SolverInput
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def parse_grid(config: dict[str, Any] | None) -> TimeGrid:
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    periods = sorted(int(p["no"]) if isinstance(p, dict) else int(p) for p in cfg["periods"])
    blocked = set()
    for b in cfg.get("blocked") or []:
        for p in b.get("periods", []):
            blocked.add((int(b["day"]), int(p)))
    return TimeGrid(
        days=[int(d) for d in cfg["days"]],
        periods=periods,
        lunch_after=cfg.get("lunch_after_period"),
        blocked=blocked,
        max_periods_per_day_group=int(cfg.get("max_periods_per_day_group") or len(periods)),
    )


def parse_unavailable(raw: Any) -> set[tuple[int, int]]:
    out = set()
    for item in raw or []:
        for p in item.get("periods", []):
            out.add((int(item["day"]), int(p)))
    return out


class _UF:
    def __init__(self) -> None:
        self.p: dict[str, str] = {}

    def find(self, a: str) -> str:
        self.p.setdefault(a, a)
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]
            a = self.p[a]
        return a

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)


def build(
    semester: dict[str, Any],
    enrollments: list[dict[str, Any]],
    subjects: dict[str, dict[str, Any]],
    teachers: dict[str, dict[str, Any]],
    rooms: list[dict[str, Any]],
    groups: dict[str, dict[str, Any]],
    locked_schedules: list[dict[str, Any]],
) -> BuildResult:
    grid = parse_grid(semester.get("config"))
    warnings: list[str] = []
    errors: list[str] = []
    enr_by_id = {e["id"]: e for e in enrollments}

    # ---------- กลุ่มคู่ขนาน ----------
    uf = _UF()
    for g in groups.values():
        uf.find(g["id"])
        if g.get("is_parallel") and g.get("parallel_ref_id") in groups:
            uf.union(g["id"], g["parallel_ref_id"])

    # ---------- คาบที่ล็อกไว้ ----------
    locked_hours: dict[str, int] = defaultdict(int)
    sessions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for s in locked_schedules:
        e = enr_by_id.get(s["enrollment_id"])
        if not e:
            continue
        locked_hours[e["id"]] += s["end_period"] - s["start_period"] + 1
        sessions[s.get("session_key") or s["id"]].append(s)
    fixed: list[FixedPlacement] = []
    for rows in sessions.values():
        first = rows[0]
        e0 = enr_by_id[first["enrollment_id"]]
        fixed.append(
            FixedPlacement(
                teacher_id=e0["teacher_id"],
                group_ids=sorted({enr_by_id[r["enrollment_id"]]["student_group_id"] for r in rows}),
                room_id=first.get("room_id"),
                day=first["day_of_week"],
                start=first["start_period"],
                end=first["end_period"],
            )
        )

    # ---------- รวม enrollment ที่เรียนรวม (คู่ขนาน) ----------
    merged: dict[tuple, list[dict[str, Any]]] = defaultdict(list)
    for e in enrollments:
        total = int(e.get("total_hours_required") or 0)
        remaining = total - locked_hours.get(e["id"], 0)
        if remaining < 0:
            warnings.append(f"ภาระงาน {e['id']}: คาบที่ล็อกไว้มากกว่าชั่วโมงที่ต้องเรียน")
            continue
        if remaining == 0:
            continue
        root = uf.find(e["student_group_id"])
        key = (root, e["subject_id"], e["teacher_id"], remaining, e.get("preferred_room_id"))
        merged[key].append({**e, "_remaining": remaining})

    blocks: list[Block] = []
    teacher_load: dict[str, int] = defaultdict(int)
    group_load: dict[str, int] = defaultdict(int)

    for f in fixed:
        teacher_load[f.teacher_id] += f.end - f.start + 1
        for g in f.group_ids:
            group_load[g] += f.end - f.start + 1

    for key, members in merged.items():
        e0 = members[0]
        subj = subjects.get(e0["subject_id"])
        if not subj:
            errors.append(f"ไม่พบรายวิชา {e0['subject_id']}")
            continue
        remaining = e0["_remaining"]
        sizes = e0.get("block_sizes") if not locked_hours.get(e0["id"]) else None
        sizes = [int(s) for s in sizes] if sizes else split_hours(remaining)
        group_ids = [m["student_group_id"] for m in members]
        students = sum(int(groups.get(g, {}).get("student_count") or 0) for g in group_ids)
        gcodes = ", ".join(groups.get(g, {}).get("group_code", g[:6]) for g in group_ids)
        label = f"{subj['subject_code']} {subj['subject_name']} [{gcodes}]"
        teacher_load[e0["teacher_id"]] += remaining
        for g in group_ids:
            group_load[g] += remaining
        for i, size in enumerate(sizes):
            blocks.append(
                Block(
                    id=f"{e0['id']}#{i}",
                    enrollment_ids=[m["id"] for m in members],
                    teacher_id=e0["teacher_id"],
                    group_ids=group_ids,
                    length=size,
                    room_type=subj.get("required_room_type") or "theory",
                    students=students,
                    spread_key="|".join(map(str, key)),
                    preferred_room_id=e0.get("preferred_room_id"),
                    label=label,
                )
            )

    # ---------- ตรวจภาระงานล่วงหน้า (Pre-check) ----------
    n_slots = len(grid.days) * len(grid.periods) - len(grid.blocked)
    for tid, load in teacher_load.items():
        t = teachers.get(tid, {})
        name = t.get("name", tid)
        if load > int(t.get("max_hours_per_week") or 999):
            warnings.append(f"{name}: ภาระสอน {load} คาบ เกินเกณฑ์ {t.get('max_hours_per_week')} คาบ/สัปดาห์")
        free = n_slots - len(parse_unavailable(t.get("unavailable_times")) - grid.blocked)
        if load > free:
            errors.append(f"{name}: ภาระสอน {load} คาบ มากกว่าเวลาว่าง {free} คาบ")
    for gid, load in group_load.items():
        if load > n_slots:
            code = groups.get(gid, {}).get("group_code", gid)
            errors.append(f"กลุ่ม {code}: ชั่วโมงเรียน {load} คาบ มากกว่าคาบที่มีในสัปดาห์ {n_slots} คาบ")

    data = SolverInput(
        grid=grid,
        rooms=[
            Room(id=r["id"], room_type=r.get("room_type") or "theory", capacity=int(r.get("capacity") or 0),
                 label=r.get("room_name", ""))
            for r in rooms
        ],
        blocks=blocks,
        teacher_unavailable={tid: parse_unavailable(t.get("unavailable_times")) for tid, t in teachers.items()},
        fixed=fixed,
    )
    return BuildResult(data=data, warnings=warnings, errors=errors)
