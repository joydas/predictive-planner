import pandas as pd

from config.db import get_engine
from utils.feature_utils import numeric, read_table, severity_score


def build_cr_features(engine=None) -> pd.DataFrame:
    engine = engine or get_engine()
    cr = read_table(engine, "change_request")
    if cr.empty:
        return pd.DataFrame(columns=["project_id"])

    cr["schedule_impact_days"] = numeric(cr.get("schedule_impact_days", pd.Series(dtype=float)))
    cr["estimated_effort_hours"] = numeric(cr.get("estimated_effort_hours", pd.Series(dtype=float)))
    cr["severity_numeric"] = cr.get("severity", pd.Series(dtype=object)).map(severity_score)
    cr["is_defect_linked"] = (
        cr.get("cr_category", pd.Series(dtype=object)).fillna("").str.contains("defect|bug", case=False, regex=True)
        | cr.get("root_cause", pd.Series(dtype=object)).fillna("").str.contains("defect|bug", case=False, regex=True)
    ).astype(int)

    grouped = cr.groupby("project_id", dropna=False).agg(
        CR_count=("cr_id", "count"),
        total_schedule_impact=("schedule_impact_days", "sum"),
        avg_CR_effort=("estimated_effort_hours", "mean"),
        avg_CR_severity=("severity_numeric", "mean"),
        total_effort_increase=("estimated_effort_hours", "sum"),
        total_schedule_increase=("schedule_impact_days", "sum"),
        defect_linked_CR_ratio=("is_defect_linked", "mean"),
    ).reset_index()

    grouped["CR_frequency"] = grouped["CR_count"]
    grouped["CR_volatility_score"] = (
        grouped["CR_count"] * 0.4
        + grouped["avg_CR_severity"].fillna(0) * 0.3
        + grouped["total_schedule_increase"].fillna(0) * 0.3
    )
    return grouped.fillna(0)
