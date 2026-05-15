import json
import re
from datetime import datetime, timezone
from typing import Any

import pandas as pd
from pandas.api.types import is_numeric_dtype
from sqlalchemy import inspect, text


TARGET_COLUMNS = {
    "actual_effort_hours",
    "schedule_variance_percent",
    "delayed_flag",
}


def normalize_role(value: Any) -> str:
    if pd.isna(value):
        return "Unknown"
    raw = str(value or "Unknown").strip()
    if not raw or raw.lower() == "nan":
        raw = "Unknown"
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", raw).strip("_")
    return cleaned or "Unknown"


def parse_json(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def numeric(series: pd.Series, default: float = 0.0) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").fillna(default)


def severity_score(value: Any) -> int:
    mapping = {
        "LOW": 1,
        "MINOR": 1,
        "MEDIUM": 2,
        "MODERATE": 2,
        "HIGH": 3,
        "MAJOR": 3,
        "CRITICAL": 4,
        "BLOCKER": 4,
    }
    return mapping.get(str(value or "").strip().upper(), 0)


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_table(engine, table_name: str) -> pd.DataFrame:
    inspector = inspect(engine)
    if not inspector.has_table(table_name):
        return pd.DataFrame()
    return pd.read_sql_table(table_name, engine)


def read_sql_or_empty(engine, sql: str) -> pd.DataFrame:
    try:
        return pd.read_sql_query(text(sql), engine)
    except Exception:
        return pd.DataFrame()


def safe_days(start: pd.Series, end: pd.Series) -> pd.Series:
    start_dt = pd.to_datetime(start, errors="coerce")
    end_dt = pd.to_datetime(end, errors="coerce")
    return (end_dt - start_dt).dt.days.fillna(0).clip(lower=0)


def model_feature_columns(df: pd.DataFrame) -> list[str]:
    excluded = set(TARGET_COLUMNS)
    excluded.update({col for col in df.columns if col.startswith("target_staff_")})
    excluded.update(
        {
            "project_id",
            "source_draft_id",
            "project_code",
            "project_name",
            "client_name",
        }
    )
    return [col for col in df.columns if col not in excluded]


def split_feature_types(df: pd.DataFrame, feature_columns: list[str]) -> tuple[list[str], list[str]]:
    numeric_cols = [col for col in feature_columns if is_numeric_dtype(df[col])]
    categorical = [col for col in feature_columns if col not in numeric_cols]
    return numeric_cols, categorical
