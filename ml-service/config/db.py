import os
from functools import lru_cache
from urllib.parse import quote_plus

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine


def _first_env(*keys: str, default: str = "") -> str:
    for key in keys:
        value = os.getenv(key)
        if value not in (None, ""):
            return value
    return default


def get_database_url() -> str:
    explicit_url = os.getenv("DATABASE_URL")
    if explicit_url:
        return explicit_url

    host = _first_env("DB_HOST", "MYSQL_HOST", default="localhost")
    port = _first_env("DB_PORT", "MYSQL_PORT", default="3306")
    user = _first_env("DB_USER", "DB_USERNAME", "MYSQL_USER", default="root")
    password = _first_env("DB_PASSWORD", "MYSQL_PASSWORD", default="")
    database = _first_env("DB_NAME", "MYSQL_DATABASE", default="predictive_planner_v2")

    return (
        f"mysql+pymysql://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{database}?charset=utf8mb4"
    )


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(get_database_url(), pool_pre_ping=True, pool_recycle=3600)
