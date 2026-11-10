"""
AI Scheduling Engine — Constraint Programming (Google OR-Tools CP-SAT)

แนวคิด
------
* แต่ละ "ภาระงานสอน" (enrollment) ถูกแบ่งเป็น "ก้อนคาบเรียนต่อเนื่อง" (Block) เช่น 7 ชม. -> [4, 3]
* กลุ่มคู่ขนาน (parallel groups) ที่เรียนวิชาเดียวกันกับครูคนเดียวกัน จะถูกรวมเป็น Block เดียว
* ตัวแปรตัดสินใจ x[b, day, start, room] = 1 ถ้า Block b เริ่มที่วัน day คาบ start ในห้อง room

Hard constraints (ห้ามละเมิด)
* ทุก Block ต้องถูกจัดลงตารางพอดี 1 ตำแหน่ง
* ครู / กลุ่มนักเรียน / ห้อง ห้ามซ้อนเวลากัน
* ห้องต้องตรงประเภท (room_type) และความจุพอ
* ห้ามจัดในเวลาที่ครูไม่สะดวก และคาบที่ถูกบล็อก (เช่น กิจกรรมวันพุธบ่าย)
* Block ห้ามคร่อมพักกลางวัน (ยกเว้น Block ยาวกว่าครึ่งวัน)
* คาบที่ถูกล็อกไว้ (is_locked) ถือเป็นค่าคงที่

Soft constraints (พยายามให้ดีที่สุด)
* Block ของวิชาเดียวกันไม่ควรอยู่วันเดียวกัน
* จำนวนคาบต่อวันของกลุ่มไม่ควรเกิน max_periods_per_day_group
* หลีกเลี่ยงคาบสุดท้ายของวันเมื่อเป็นไปได้
"""

from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

from ortools.sat.python import cp_model

Slot = tuple[int, int]  # (day, period)


@dataclass
class Room:
    id: str
    room_type: str
    capacity: int
    label: str = ""


@dataclass
class Block:
    id: str
    enrollment_ids: list[str]
    teacher_id: str
    group_ids: list[str]
    length: int
    room_type: str
    students: int
    spread_key: str  # Block ที่ key เดียวกันควรอยู่ต่างวัน
    preferred_room_id: Optional[str] = None
    label: str = ""


@dataclass
class FixedPlacement:
    """คาบที่ล็อกไว้แล้ว (ไม่ย้าย)"""
    teacher_id: str
    group_ids: list[str]
    room_id: Optional[str]
    day: int
    start: int
    end: int


@dataclass
class TimeGrid:
    days: list[int]
    periods: list[int]  # เลขคาบเรียงจากน้อยไปมาก
    lunch_after: Optional[int] = None
    blocked: set[Slot] = field(default_factory=set)
    max_periods_per_day_group: int = 8


@dataclass
class SolverInput:
    grid: TimeGrid
    rooms: list[Room]
    blocks: list[Block]
    teacher_unavailable: dict[str, set[Slot]] = field(default_factory=dict)
    fixed: list[FixedPlacement] = field(default_factory=list)


@dataclass
class Placement:
    block: Block
    day: int
    start: int
    end: int
    room_id: str


@dataclass
class SolverResult:
    ok: bool
    status: str
    placements: list[Placement] = field(default_factory=list)
    message: str = ""
    problems: list[str] = field(default_factory=list)
    objective: Optional[float] = None
    wall_time: float = 0.0
    num_variables: int = 0


ProgressFn = Callable[[int, str], None]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def split_hours(total: int, max_block: int = 4) -> list[int]:
    """แบ่งชั่วโมงเป็นก้อน ก้อนละไม่เกิน max_block และขนาดใกล้เคียงกัน เช่น 7 -> [4,3], 6 -> [3,3]"""
    if total <= 0:
        return []
    n = math.ceil(total / max_block)
    base, extra = divmod(total, n)
    return [base + 1] * extra + [base] * (n - extra)


def valid_spans(grid: TimeGrid, length: int) -> list[tuple[int, int, list[int]]]:
    """คืน (day, start, [periods]) ที่ Block ยาว length วางได้ตามโครงตารางเวลา"""
    periods = grid.periods
    morning = [p for p in periods if grid.lunch_after is not None and p <= grid.lunch_after]
    afternoon = [p for p in periods if p not in morning]
    allow_cross = grid.lunch_after is None or length > max(len(morning), len(afternoon))
    out = []
    for d in grid.days:
        for i in range(len(periods) - length + 1):
            span = periods[i : i + length]
            if not allow_cross and grid.lunch_after is not None:
                if span[0] <= grid.lunch_after < span[-1]:
                    continue
            if any((d, p) in grid.blocked for p in span):
                continue
            out.append((d, span[0], span))
    return out


# ---------------------------------------------------------------------------
# Solver
# ---------------------------------------------------------------------------
def solve(
    data: SolverInput,
    time_limit: float = 60.0,
    progress: Optional[ProgressFn] = None,
    workers: int = 8,
) -> SolverResult:
    def report(pct: int, msg: str) -> None:
        if progress:
            progress(pct, msg)

    grid = data.grid
    period_index = {p: i for i, p in enumerate(grid.periods)}

    # ----- ทรัพยากรที่ถูกใช้ไปแล้วโดยคาบที่ล็อก -----
    fixed_teacher: dict[str, set[Slot]] = {}
    fixed_group: dict[str, set[Slot]] = {}
    fixed_room: dict[str, set[Slot]] = {}
    for f in data.fixed:
        slots = {(f.day, p) for p in grid.periods if f.start <= p <= f.end}
        fixed_teacher.setdefault(f.teacher_id, set()).update(slots)
        for g in f.group_ids:
            fixed_group.setdefault(g, set()).update(slots)
        if f.room_id:
            fixed_room.setdefault(f.room_id, set()).update(slots)

    report(22, "กำลังสร้างตัวแปรและเงื่อนไข")

    model = cp_model.CpModel()
    problems: list[str] = []
    x: dict[tuple[int, int, int, str], cp_model.IntVar] = {}
    block_vars: dict[int, list[tuple[cp_model.IntVar, int, int, list[int], str]]] = {}

    span_cache: dict[int, list[tuple[int, int, list[int]]]] = {}

    for bi, b in enumerate(data.blocks):
        if b.length not in span_cache:
            span_cache[b.length] = valid_spans(grid, b.length)
        rooms = [
            r for r in data.rooms
            if (b.preferred_room_id is None or r.id == b.preferred_room_id)
            and (b.preferred_room_id is not None or r.room_type == b.room_type)
            and r.capacity >= b.students
        ]
        if not rooms:
            problems.append(
                f"{b.label}: ไม่มีห้องประเภท '{b.room_type}' ที่จุได้ {b.students} คน"
            )
            continue
        unavailable = data.teacher_unavailable.get(b.teacher_id, set())
        t_fixed = fixed_teacher.get(b.teacher_id, set())
        g_fixed: set[Slot] = set()
        for g in b.group_ids:
            g_fixed |= fixed_group.get(g, set())

        cands = []
        for d, s, span in span_cache[b.length]:
            slots = [(d, p) for p in span]
            if any(sl in unavailable or sl in t_fixed or sl in g_fixed for sl in slots):
                continue
            for r in rooms:
                r_fixed = fixed_room.get(r.id, set())
                if any(sl in r_fixed for sl in slots):
                    continue
                v = model.NewBoolVar(f"x_{bi}_{d}_{s}_{r.id[:8]}")
                x[(bi, d, s, r.id)] = v
                cands.append((v, d, s, span, r.id))
        if not cands:
            problems.append(f"{b.label}: ไม่มีช่วงเวลาว่างที่วางได้ (ตรวจเวลาไม่สะดวกของครู/คาบที่ล็อก)")
            continue
        block_vars[bi] = cands
        model.AddExactlyOne(v for v, *_ in cands)

    if problems:
        return SolverResult(
            ok=False,
            status="PRECHECK_FAILED",
            message="ข้อมูลบางรายการไม่สามารถจัดลงตารางได้",
            problems=problems,
        )

    # ----- ห้ามซ้อนเวลา: ครู กลุ่ม ห้อง -----
    occ_teacher: dict[tuple[str, Slot], list] = {}
    occ_group: dict[tuple[str, Slot], list] = {}
    occ_room: dict[tuple[str, Slot], list] = {}
    for bi, cands in block_vars.items():
        b = data.blocks[bi]
        for v, d, s, span, rid in cands:
            for p in span:
                sl = (d, p)
                occ_teacher.setdefault((b.teacher_id, sl), []).append(v)
                for g in b.group_ids:
                    occ_group.setdefault((g, sl), []).append(v)
                occ_room.setdefault((rid, sl), []).append(v)

    for occ in (occ_teacher, occ_group, occ_room):
        for vars_ in occ.values():
            if len(vars_) > 1:
                model.AddAtMostOne(vars_)

    report(30, "กำลังเพิ่มเงื่อนไขคุณภาพตาราง")

    penalties: list[cp_model.LinearExprT] = []

    # day indicator ต่อ block
    day_of: dict[tuple[int, int], cp_model.IntVar] = {}
    for bi, cands in block_vars.items():
        for d in grid.days:
            vs = [v for v, dd, *_ in cands if dd == d]
            if not vs:
                continue
            dv = model.NewBoolVar(f"day_{bi}_{d}")
            model.Add(sum(vs) == dv)
            day_of[(bi, d)] = dv

    # 1) block วิชาเดียวกันไม่ควรอยู่วันเดียวกัน
    by_key: dict[str, list[int]] = {}
    for bi in block_vars:
        by_key.setdefault(data.blocks[bi].spread_key, []).append(bi)
    for bis in by_key.values():
        for i in range(len(bis)):
            for j in range(i + 1, len(bis)):
                for d in grid.days:
                    a, c = day_of.get((bis[i], d)), day_of.get((bis[j], d))
                    if a is None or c is None:
                        continue
                    same = model.NewBoolVar("")
                    model.Add(same >= a + c - 1)
                    penalties.append(20 * same)

    # 2) จำนวนคาบต่อวันของกลุ่ม
    group_ids = {g for b in data.blocks for g in b.group_ids}
    cap = grid.max_periods_per_day_group
    for g in group_ids:
        for d in grid.days:
            terms = []
            for bi, cands in block_vars.items():
                b = data.blocks[bi]
                if g in b.group_ids and (bi, d) in day_of:
                    terms.append(b.length * day_of[(bi, d)])
            if not terms:
                continue
            fixed_load = len([sl for sl in fixed_group.get(g, set()) if sl[0] == d])
            over = model.NewIntVar(0, len(grid.periods), "")
            model.Add(over >= sum(terms) + fixed_load - cap)
            penalties.append(10 * over)

    # 3) เลี่ยงคาบสุดท้ายของวัน
    last = grid.periods[-1]
    for bi, cands in block_vars.items():
        for v, d, s, span, rid in cands:
            if last in span:
                penalties.append(1 * v)

    if penalties:
        model.Minimize(sum(penalties))

    n_vars = len(x)
    report(35, f"เริ่มค้นหาคำตอบ ({n_vars:,} ตัวแปร, {len(block_vars)} ก้อนคาบเรียน)")

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit)
    solver.parameters.num_search_workers = workers
    solver.parameters.random_seed = 42

    # ----- รายงานความคืบหน้าระหว่างค้นหา (35% -> 90%) -----
    stop = threading.Event()
    state = {"best": None, "found": 0}
    t0 = time.time()

    class Cb(cp_model.CpSolverSolutionCallback):
        def __init__(self) -> None:
            super().__init__()

        def on_solution_callback(self) -> None:  # noqa: N802
            state["found"] += 1
            state["best"] = self.ObjectiveValue() if penalties else 0

    def ticker() -> None:
        while not stop.wait(2.0):
            frac = min(1.0, (time.time() - t0) / max(time_limit, 1))
            pct = 35 + int(55 * frac)
            if state["found"]:
                msg = f"พบตารางที่ไม่ขัดแย้งแล้ว {state['found']} แบบ กำลังปรับปรุง (คะแนนโทษ {state['best']:.0f})"
            else:
                msg = "กำลังค้นหาตารางที่ไม่ขัดแย้ง..."
            report(pct, msg)

    th = threading.Thread(target=ticker, daemon=True)
    th.start()
    try:
        status = solver.Solve(model, Cb())
    finally:
        stop.set()
        th.join(timeout=3)

    status_name = solver.StatusName(status)
    wall = solver.WallTime()
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        msg = (
            "ไม่พบตารางที่ไม่ขัดแย้งภายในเวลาที่กำหนด ลองเพิ่มเวลาคำนวณ"
            if status == cp_model.UNKNOWN
            else "เงื่อนไขขัดแย้งกัน ไม่สามารถจัดตารางได้ (เช่น ครูมีภาระสอนเกินเวลาว่าง หรือห้องไม่พอ)"
        )
        return SolverResult(ok=False, status=status_name, message=msg, wall_time=wall, num_variables=n_vars)

    placements = []
    for bi, cands in block_vars.items():
        for v, d, s, span, rid in cands:
            if solver.BooleanValue(v):
                placements.append(Placement(data.blocks[bi], d, span[0], span[-1], rid))
                break

    return SolverResult(
        ok=True,
        status=status_name,
        placements=placements,
        message="จัดตารางสำเร็จ" + (" (คำตอบดีที่สุด)" if status == cp_model.OPTIMAL else ""),
        objective=solver.ObjectiveValue() if penalties else 0,
        wall_time=wall,
        num_variables=n_vars,
    )
