import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    supabase_url: str = os.environ.get("SUPABASE_URL", "")
    supabase_service_role_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    allowed_origins: list[str] = [
        o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()
    ]
    default_time_limit: int = int(os.environ.get("DEFAULT_TIME_LIMIT", "60"))
    max_time_limit: int = int(os.environ.get("MAX_TIME_LIMIT", "600"))
    solver_workers: int = int(os.environ.get("SOLVER_WORKERS", "8"))


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise RuntimeError("ต้องตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ในไฟล์ .env")
    return s
