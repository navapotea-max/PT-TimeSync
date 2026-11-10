"""ทดสอบ AI Engine โดยไม่ต้องต่อฐานข้อมูล:  pytest -q"""

from collections import defaultdict

from app.builder import build
from app.solver import solve, split_hours

CONFIG = {
    "days": [1, 2, 3, 4, 5],
    "periods": [{"no": i} for i in range(1, 9)],
    "lunch_after_period": 4,
    "blocked": [{"day": 3, "periods": [7, 8]}],
    "max_periods_per_day_group": 8,
}


def _fixture():
    semester = {"id": "S", "config": CONFIG}
    subjects = {
        "TH": {"id": "TH", "subject_code": "20000-1101", "subject_name": "ไทย", "required_room_type": "theory"},
        "EN": {"id": "EN", "subject_code": "20000-1201", "subject_name": "อังกฤษ", "required_room_type": "theory"},
        "AU": {"id": "AU", "subject_code": "20101-2001", "subject_name": "เครื่องยนต์", "required_room_type": "workshop"},
        "CP": {"id": "CP", "subject_code": "20200-1002", "subject_name": "คอม", "required_room_type": "computer_lab"},
    }
    teachers = {
        "T1": {"id": "T1", "name": "ครู 1", "max_hours_per_week": 22, "unavailable_times": [{"day": 1, "periods": [1, 2, 3, 4]}]},
        "T2": {"id": "T2", "name": "ครู 2", "max_hours_per_week": 22, "unavailable_times": []},
        "T3": {"id": "T3", "name": "ครู 3", "max_hours_per_week": 22, "unavailable_times": []},
    }
    rooms = [
        {"id": "R1", "room_name": "111", "room_type": "theory", "capacity": 40},
        {"id": "R2", "room_name": "121", "room_type": "theory", "capacity": 70},
        {"id": "W1", "room_name": "Auto", "room_type": "workshop", "capacity": 40},
        {"id": "C1", "room_name": "Com", "room_type": "computer_lab", "capacity": 40},
    ]
    groups = {
        "G1": {"id": "G1", "group_code": "ชย.1/1", "student_count": 30},
        "G2": {"id": "G2", "group_code": "ชย.1/2", "student_count": 28, "is_parallel": True, "parallel_ref_id": "G1"},
        "G3": {"id": "G3", "group_code": "บช.1/1", "student_count": 25},
    }
    enr = []

    def add(i, g, s, t, h):
        enr.append({"id": i, "semester_id": "S", "student_group_id": g, "subject_id": s,
                    "teacher_id": t, "total_hours_required": h})

    add("e1", "G1", "TH", "T1", 2); add("e2", "G2", "TH", "T1", 2)   # เรียนรวม (คู่ขนาน)
    add("e3", "G1", "AU", "T2", 7); add("e4", "G2", "AU", "T3", 7)   # ครูต่างกัน -> แยก
    add("e5", "G3", "TH", "T1", 2); add("e6", "G3", "EN", "T3", 2)
    add("e7", "G3", "CP", "T2", 3); add("e8", "G1", "EN", "T3", 2)
    return semester, enr, subjects, teachers, rooms, groups


def test_split_hours():
    assert split_hours(7) == [4, 3]
    assert split_hours(6) == [3, 3]
    assert split_hours(4) == [4]
    assert split_hours(9) == [3, 3, 3]


def test_solve_conflict_free():
    sem, enr, subj, tch, rooms, groups = _fixture()
    built = build(sem, enr, subj, tch, rooms, groups, [])
    assert not built.errors
    # e1 + e2 ถูกรวมเป็นก้อนเดียว
    merged = [b for b in built.data.blocks if set(b.enrollment_ids) == {"e1", "e2"}]
    assert len(merged) == 1 and merged[0].students == 58

    res = solve(built.data, time_limit=10, workers=2)
    assert res.ok, res.message

    teacher, group, room = defaultdict(set), defaultdict(set), defaultdict(set)
    room_by_id = {r["id"]: r for r in rooms}
    for pl in res.placements:
        b = pl.block
        assert room_by_id[pl.room_id]["capacity"] >= b.students
        assert room_by_id[pl.room_id]["room_type"] == b.room_type
        # ไม่คร่อมพักเที่ยง และไม่ทับคาบกิจกรรม
        assert not (pl.start <= 4 < pl.end)
        for p in range(pl.start, pl.end + 1):
            slot = (pl.day, p)
            assert slot not in {(3, 7), (3, 8)}
            assert slot not in teacher[b.teacher_id]; teacher[b.teacher_id].add(slot)
            assert slot not in room[pl.room_id]; room[pl.room_id].add(slot)
            for g in b.group_ids:
                assert slot not in group[g]; group[g].add(slot)
            if b.teacher_id == "T1":
                assert slot not in {(1, 1), (1, 2), (1, 3), (1, 4)}


def test_locked_sessions_are_respected():
    sem, enr, subj, tch, rooms, groups = _fixture()
    locked = [{"id": "L1", "enrollment_id": "e7", "room_id": "C1", "day_of_week": 2,
               "start_period": 1, "end_period": 3, "session_key": "k"}]
    built = build(sem, enr, subj, tch, rooms, groups, locked)
    assert not any("e7" in b.enrollment_ids for b in built.data.blocks)
    res = solve(built.data, time_limit=10, workers=2)
    assert res.ok
    for pl in res.placements:
        if "G3" in pl.block.group_ids or pl.block.teacher_id == "T2":
            assert not (pl.day == 2 and pl.start <= 3)


def test_precheck_reports_missing_room_type():
    sem, enr, subj, tch, rooms, groups = _fixture()
    rooms = [r for r in rooms if r["room_type"] != "computer_lab"]
    built = build(sem, enr, subj, tch, rooms, groups, [])
    res = solve(built.data, time_limit=5, workers=2)
    assert not res.ok and res.status == "PRECHECK_FAILED"
    assert any("computer_lab" in p for p in res.problems)
