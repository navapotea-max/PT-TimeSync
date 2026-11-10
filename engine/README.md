# AI Scheduling Engine

FastAPI + Google OR-Tools (CP-SAT) — อ่านข้อมูลจาก Supabase จัดตารางแบบไม่ชนกัน แล้วเขียนผลกลับลงตาราง `schedules`
พร้อมรายงานความคืบหน้าผ่านตาราง `schedule_jobs` (Supabase Realtime)

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env    # แล้วใส่ค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
uvicorn app.main:app --reload --port 8000
pytest -q               # รันชุดทดสอบ
```

| Endpoint | คำอธิบาย |
|---|---|
| `GET /health` | ตรวจสถานะ |
| `POST /jobs` | เริ่มจัดตาราง `{"semester_id": "...", "time_limit_seconds": 60}` ต้องแนบ `Authorization: Bearer <access_token ของ admin>` |

ไฟล์สำคัญ: `app/solver.py` (โมเดล CP-SAT), `app/builder.py` (แปลงข้อมูล/รวมกลุ่มคู่ขนาน/Pre-check), `app/runner.py` (ลำดับงาน + Realtime progress)
