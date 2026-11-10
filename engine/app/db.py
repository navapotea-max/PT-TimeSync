from functools import lru_cache
from typing import Any

import httpx
from supabase import Client, create_client

from .config import get_settings

PAGE = 1000


@lru_cache
def get_client() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_role_key)


def fetch_all(table: str, columns: str = "*", **eq: Any) -> list[dict[str, Any]]:
    """ดึงข้อมูลทั้งหมด (แบ่งหน้า 1,000 แถว ตามข้อจำกัดของ PostgREST)"""
    sb = get_client()
    out: list[dict[str, Any]] = []
    start = 0
    while True:
        q = sb.table(table).select(columns)
        for k, v in eq.items():
            q = q.eq(k, v)
        rows = q.order("id").range(start, start + PAGE - 1).execute().data or []
        out.extend(rows)
        if len(rows) < PAGE:
            return out
        start += PAGE


def verify_user(access_token: str) -> dict[str, Any] | None:
    """ตรวจ JWT ของผู้ใช้กับ Supabase Auth แล้วคืน profile (ต้องเป็น admin เท่านั้นจึงสั่งจัดตารางได้)"""
    s = get_settings()
    r = httpx.get(
        f"{s.supabase_url}/auth/v1/user",
        headers={"Authorization": f"Bearer {access_token}", "apikey": s.supabase_service_role_key},
        timeout=10,
    )
    if r.status_code != 200:
        return None
    user = r.json()
    rows = get_client().table("profiles").select("*").eq("id", user["id"]).limit(1).execute().data
    return rows[0] if rows else None
