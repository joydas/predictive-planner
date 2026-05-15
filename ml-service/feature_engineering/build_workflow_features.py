import pandas as pd

from config.db import get_engine
from utils.feature_utils import read_table


def _workflow_features(df: pd.DataFrame, id_column: str, prefix: str = "") -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=[id_column])

    df = df.copy()
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")
    df["is_return"] = df["action_type"].fillna("").str.upper().eq("RETURN").astype(int)
    df["is_reject"] = df["action_type"].fillna("").str.upper().eq("REJECT").astype(int)
    df["is_submit"] = df["action_type"].fillna("").str.upper().isin(["SUBMIT", "RESUBMIT"]).astype(int)
    df["is_approve"] = df["action_type"].fillna("").str.upper().eq("APPROVE").astype(int)

    grouped = df.groupby(id_column, dropna=False).agg(
        return_frequency=("is_return", "sum"),
        rejection_frequency=("is_reject", "sum"),
        resubmission_count=("is_submit", "sum"),
        approval_cycle_count=("is_approve", "sum"),
        workflow_start=("created_at", "min"),
        workflow_end=("created_at", "max"),
    ).reset_index()
    grouped["workflow_cycle_duration"] = (
        grouped["workflow_end"] - grouped["workflow_start"]
    ).dt.total_seconds().fillna(0) / 3600

    approvals = df[df["is_approve"] == 1].groupby(id_column)["created_at"].min()
    submissions = df[df["is_submit"] == 1].groupby(id_column)["created_at"].min()
    turnaround = ((approvals - submissions).dt.total_seconds() / 3600).rename("approval_turnaround_time")
    grouped = grouped.merge(turnaround, on=id_column, how="left")
    grouped["approval_turnaround_time"] = grouped["approval_turnaround_time"].fillna(0).clip(lower=0)
    grouped = grouped.drop(columns=["workflow_start", "workflow_end"])

    if prefix:
        grouped = grouped.rename(columns={col: f"{prefix}{col}" for col in grouped.columns if col != id_column})
    return grouped.fillna(0)


def build_project_workflow_features(engine=None) -> pd.DataFrame:
    engine = engine or get_engine()
    history = read_table(engine, "project_workflow_history")
    return _workflow_features(history, "project_id")


def build_cr_workflow_features(engine=None) -> pd.DataFrame:
    engine = engine or get_engine()
    history = read_table(engine, "cr_workflow_history")
    if history.empty:
        return pd.DataFrame(columns=["project_id"])
    cr = read_table(engine, "change_request")
    if cr.empty:
        return pd.DataFrame(columns=["project_id"])
    history = history.merge(cr[["cr_id", "project_id"]], on="cr_id", how="left")
    cr_features = _workflow_features(history, "project_id", prefix="cr_")
    return cr_features
