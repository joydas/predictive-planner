from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd
from sqlalchemy import bindparam, inspect, text

from config.db import get_engine


FORECAST_FEATURE_COLUMNS = [
    "industry",
    "technology",
    "complexity",
    "project_type",
    "planned_duration_days",
    "current_planned_effort",
    "current_planned_budget",
    "current_planned_team_size",
    "pm_estimated_value",
    "ai_estimated_value",
    "approved_cr_count",
    "total_cr_effort_impact",
    "total_cr_budget_impact",
    "total_cr_duration_impact",
    "latest_completion_percent",
    "progress_snapshot_count",
    "days_since_last_progress_update",
    "average_progress_velocity",
    "progress_velocity_trend",
    "actual_effort_to_date",
    "actual_budget_to_date",
    "actual_team_size",
]

MIN_FORECAST_TRAINING_ROWS = 5


def _to_number(value: Any, default: float = 0.0) -> float:
    if value in (None, ""):
        return default
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return default
    return numeric if pd.notna(numeric) else default


def _to_date(value: Any):
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date()


def _days_between(start: Any, end: Any, inclusive: bool = False) -> int:
    start_date = _to_date(start)
    end_date = _to_date(end)
    if not start_date or not end_date or end_date < start_date:
        return 0
    days = (end_date - start_date).days
    return days + 1 if inclusive else days


def _days_since(value: Any, today: date | None = None) -> int:
    value_date = _to_date(value)
    if not value_date:
        return 999
    today = today or date.today()
    return max((today - value_date).days, 0)


def _has_column(table_name: str, column_name: str) -> bool:
    inspector = inspect(get_engine())
    if not inspector.has_table(table_name):
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _regression_filter(alias: str) -> str:
    return f"AND COALESCE({alias}.is_regression_data, 0) = 0" if _has_column("project", "is_regression_data") else ""


def _read_project_rows(project_id: int | None = None, completed_only: bool = False) -> pd.DataFrame:
    project_filter = "AND p.project_id = :project_id" if project_id is not None else ""
    completed_filter = "AND pd.workflow_status IN ('COMPLETE', 'CLOSED') AND COALESCE(p.actual_completion_date, latest_completion.actual_completion_date) IS NOT NULL" if completed_only else ""
    regression_filter = _regression_filter("p")
    params = {"project_id": project_id} if project_id is not None else {}
    return pd.read_sql_query(
        text(
            f"""
            SELECT
              p.project_id AS project_id,
              p.project_name AS project_name,
              p.approved_data AS approved_data,
              JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.basicInfo.industry')) AS industry,
              JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.technology.technology_stack')) AS technology,
              JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.technology.complexity')) AS complexity,
              JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.basicInfo.project_type')) AS project_type,
              JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.deliveryDetails.start_date')) AS start_date,
              JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.deliveryDetails.planned_end_date')) AS planned_completion_date,
              p.current_planned_effort,
              p.current_planned_budget,
              p.current_planned_team_size,
              p.pm_estimated_value,
              p.ai_estimated_value,
              p.actual_effort,
              p.actual_budget,
              p.actual_team_size,
              COALESCE(p.actual_completion_date, latest_completion.actual_completion_date) AS actual_completion_date
            FROM project p
            INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
            LEFT JOIN (
              SELECT pch.project_id, DATE(pch.completed_at) AS actual_completion_date
              FROM project_completion_history pch
              INNER JOIN (
                SELECT project_id, MAX(completion_id) AS completion_id
                FROM project_completion_history
                GROUP BY project_id
              ) latest ON latest.completion_id = pch.completion_id
            ) latest_completion ON latest_completion.project_id = p.project_id
            WHERE 1 = 1
              {completed_filter}
              {project_filter}
              {regression_filter}
            """
        ),
        get_engine(),
        params=params,
    )


def _read_cr_rows(project_ids: list[int]) -> pd.DataFrame:
    if not project_ids:
        return pd.DataFrame()
    return pd.read_sql_query(
        text(
            """
            SELECT
              project_id,
              COUNT(*) AS approved_cr_count,
              SUM(COALESCE(estimated_effort_hours, 0)) AS total_cr_effort_impact,
              SUM(COALESCE(budget_impact, estimated_cost_impact, 0)) AS total_cr_budget_impact,
              SUM(COALESCE(schedule_impact_days, 0)) AS total_cr_duration_impact
            FROM change_request
            WHERE workflow_status = 'APPROVED'
              AND project_id IN :project_ids
            GROUP BY project_id
            """
        ).bindparams(bindparam("project_ids", expanding=True)),
        get_engine(),
        params={"project_ids": project_ids},
    )


def _read_progress_rows(project_ids: list[int]) -> pd.DataFrame:
    if not project_ids:
        return pd.DataFrame()
    return pd.read_sql_query(
        text(
            """
            SELECT
              project_id,
              snapshot_date,
              actual_completion_percent,
              actual_effort_pd,
              actual_budget,
              actual_team_size
            FROM project_progress_snapshot
            WHERE project_id IN :project_ids
            ORDER BY project_id, snapshot_date, snapshot_id
            """
        ).bindparams(bindparam("project_ids", expanding=True)),
        get_engine(),
        params={"project_ids": project_ids},
    )


def _latest_progress_actuals(progress: pd.DataFrame, project_ids: list[int]) -> pd.DataFrame:
    if progress.empty:
        return pd.DataFrame(
            [
                {
                    "project_id": project_id,
                    "latest_actual_effort_pd": 0.0,
                    "latest_actual_budget": 0.0,
                }
                for project_id in project_ids
            ]
        )

    rows = []
    for project_id in project_ids:
        group = progress[progress["project_id"] == project_id].copy()
        if group.empty:
            rows.append(
                {
                    "project_id": project_id,
                    "latest_actual_effort_pd": 0.0,
                    "latest_actual_budget": 0.0,
                }
            )
            continue
        group["snapshot_date"] = pd.to_datetime(group["snapshot_date"], errors="coerce")
        group = group.dropna(subset=["snapshot_date"]).sort_values("snapshot_date")
        latest = group.iloc[-1] if not group.empty else {}
        rows.append(
            {
                "project_id": project_id,
                "latest_actual_effort_pd": _to_number(latest.get("actual_effort_pd") if hasattr(latest, "get") else 0),
                "latest_actual_budget": _to_number(latest.get("actual_budget") if hasattr(latest, "get") else 0),
            }
        )
    return pd.DataFrame(rows)


def _progress_features(progress: pd.DataFrame, project_ids: list[int]) -> pd.DataFrame:
    if progress.empty:
        return pd.DataFrame(
            [
                {
                    "project_id": project_id,
                    "latest_completion_percent": 0.0,
                    "progress_snapshot_count": 0,
                    "days_since_last_progress_update": 999,
                    "average_progress_velocity": 0.0,
                    "progress_velocity_trend": 0.0,
                    "actual_effort_to_date": 0.0,
                    "actual_budget_to_date": 0.0,
                    "actual_team_size": 0.0,
                }
                for project_id in project_ids
            ]
        )

    rows = []
    for project_id in project_ids:
        group = progress[progress["project_id"] == project_id].copy()
        if group.empty:
            rows.append(
                {
                    "project_id": project_id,
                    "latest_completion_percent": 0.0,
                    "progress_snapshot_count": 0,
                    "days_since_last_progress_update": 999,
                    "average_progress_velocity": 0.0,
                    "progress_velocity_trend": 0.0,
                    "actual_effort_to_date": 0.0,
                    "actual_budget_to_date": 0.0,
                    "actual_team_size": 0.0,
                }
            )
            continue

        group["snapshot_date"] = pd.to_datetime(group["snapshot_date"], errors="coerce")
        group = group.dropna(subset=["snapshot_date"]).sort_values("snapshot_date")
        latest = group.iloc[-1]
        first = group.iloc[0]
        days_span = max((latest["snapshot_date"] - first["snapshot_date"]).days, 1)
        progress_delta = _to_number(latest["actual_completion_percent"]) - _to_number(first["actual_completion_percent"])
        average_velocity = progress_delta / days_span

        trend = 0.0
        if len(group) >= 3:
            mid = len(group) // 2
            early = group.iloc[:mid]
            recent = group.iloc[mid:]
            early_span = max((early.iloc[-1]["snapshot_date"] - early.iloc[0]["snapshot_date"]).days, 1)
            recent_span = max((recent.iloc[-1]["snapshot_date"] - recent.iloc[0]["snapshot_date"]).days, 1)
            early_velocity = (
                _to_number(early.iloc[-1]["actual_completion_percent"])
                - _to_number(early.iloc[0]["actual_completion_percent"])
            ) / early_span
            recent_velocity = (
                _to_number(recent.iloc[-1]["actual_completion_percent"])
                - _to_number(recent.iloc[0]["actual_completion_percent"])
            ) / recent_span
            trend = recent_velocity - early_velocity

        rows.append(
            {
                "project_id": project_id,
                "latest_completion_percent": _to_number(latest["actual_completion_percent"]),
                "progress_snapshot_count": int(len(group)),
                "days_since_last_progress_update": _days_since(latest["snapshot_date"]),
                "average_progress_velocity": average_velocity,
                "progress_velocity_trend": trend,
                "actual_effort_to_date": _to_number(latest["actual_effort_pd"]),
                "actual_budget_to_date": _to_number(latest["actual_budget"]),
                "actual_team_size": _to_number(latest["actual_team_size"]),
            }
        )
    return pd.DataFrame(rows)


def _assemble_features(projects: pd.DataFrame, include_target: bool = False) -> pd.DataFrame:
    if projects.empty:
        return pd.DataFrame()

    project_ids = [int(value) for value in projects["project_id"].tolist()]
    cr = _read_cr_rows(project_ids)
    progress = _progress_features(_read_progress_rows(project_ids), project_ids)
    df = projects.merge(cr, on="project_id", how="left").merge(progress, on="project_id", how="left")

    df["planned_duration_days"] = df.apply(
        lambda row: _days_between(row["start_date"], row["planned_completion_date"], inclusive=True),
        axis=1,
    )
    df["complexity"] = pd.to_numeric(df["complexity"], errors="coerce").fillna(0)

    numeric_defaults = {
        "current_planned_effort": 0,
        "current_planned_budget": 0,
        "current_planned_team_size": 0,
        "pm_estimated_value": 0,
        "ai_estimated_value": 0,
        "approved_cr_count": 0,
        "total_cr_effort_impact": 0,
        "total_cr_budget_impact": 0,
        "total_cr_duration_impact": 0,
        "latest_completion_percent": 0,
        "progress_snapshot_count": 0,
        "days_since_last_progress_update": 999,
        "average_progress_velocity": 0,
        "progress_velocity_trend": 0,
        "actual_effort_to_date": 0,
        "actual_budget_to_date": 0,
        "actual_team_size": 0,
    }
    for column, default in numeric_defaults.items():
        if column not in df.columns:
            df[column] = default
        df[column] = pd.to_numeric(df[column], errors="coerce").fillna(default)

    for column in ["industry", "technology", "project_type"]:
        if column not in df.columns:
            df[column] = ""
        df[column] = df[column].fillna("").astype(str)

    if include_target:
        df["completion_delay_days"] = df.apply(
            lambda row: (
                _to_date(row["actual_completion_date"]) - _to_date(row["planned_completion_date"])
            ).days
            if _to_date(row["actual_completion_date"]) and _to_date(row["planned_completion_date"])
            else None,
            axis=1,
        )
        df = df[df["completion_delay_days"].notna()]

    columns = ["project_id", "project_name", "planned_completion_date", *FORECAST_FEATURE_COLUMNS]
    if include_target:
        columns.append("completion_delay_days")
    return df[columns]


def _assemble_final_effort_dataset(projects: pd.DataFrame, include_target: bool = False) -> pd.DataFrame:
    if projects.empty:
        return pd.DataFrame()

    dataset = _assemble_features(projects, include_target=False)
    if not include_target:
        return dataset

    project_ids = [int(value) for value in projects["project_id"].tolist()]
    latest_actuals = _latest_progress_actuals(_read_progress_rows(project_ids), project_ids)
    targets = projects[["project_id", "actual_effort"]].merge(latest_actuals, on="project_id", how="left")
    targets["actual_final_effort_pd"] = targets.apply(
        lambda row: _to_number(row["actual_effort"], None)
        if _to_number(row["actual_effort"], None) not in (None, 0)
        else _to_number(row["latest_actual_effort_pd"], None),
        axis=1,
    )
    targets = targets[targets["actual_final_effort_pd"].notna()]
    targets = targets[targets["actual_final_effort_pd"] > 0]
    dataset = dataset.merge(targets[["project_id", "actual_final_effort_pd"]], on="project_id", how="inner")
    return dataset


def _assemble_final_budget_dataset(projects: pd.DataFrame, include_target: bool = False) -> pd.DataFrame:
    if projects.empty:
        return pd.DataFrame()

    dataset = _assemble_features(projects, include_target=False)
    if not include_target:
        return dataset

    project_ids = [int(value) for value in projects["project_id"].tolist()]
    latest_actuals = _latest_progress_actuals(_read_progress_rows(project_ids), project_ids)
    targets = projects[["project_id", "actual_budget"]].merge(latest_actuals, on="project_id", how="left")
    targets["actual_final_budget"] = targets.apply(
        lambda row: _to_number(row["actual_budget"], None)
        if _to_number(row["actual_budget"], None) not in (None, 0)
        else _to_number(row["latest_actual_budget"], None),
        axis=1,
    )
    targets = targets[targets["actual_final_budget"].notna()]
    targets = targets[targets["actual_final_budget"] > 0]
    dataset = dataset.merge(targets[["project_id", "actual_final_budget"]], on="project_id", how="inner")
    return dataset


def build_completion_forecast_training_dataset(output_path=None) -> pd.DataFrame:
    dataset = _assemble_features(_read_project_rows(completed_only=True), include_target=True)
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        dataset.to_csv(output_path, index=False)
    return dataset


def build_final_effort_forecast_training_dataset(output_path=None) -> pd.DataFrame:
    dataset = _assemble_final_effort_dataset(_read_project_rows(completed_only=True), include_target=True)
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        dataset.to_csv(output_path, index=False)
    return dataset


def build_final_budget_forecast_training_dataset(output_path=None) -> pd.DataFrame:
    dataset = _assemble_final_budget_dataset(_read_project_rows(completed_only=True), include_target=True)
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        dataset.to_csv(output_path, index=False)
    return dataset


def build_completion_forecast_input(project_id: int) -> dict:
    dataset = _assemble_features(_read_project_rows(project_id=project_id), include_target=False)
    if dataset.empty:
        raise ValueError(f"Project not found for completion forecast: {project_id}")
    row = dataset.iloc[0]
    return {
        "projectId": int(row["project_id"]),
        "projectName": row["project_name"],
        "plannedCompletionDate": str(row["planned_completion_date"] or "")[:10],
        "features": row[FORECAST_FEATURE_COLUMNS].to_dict(),
    }


def build_final_effort_forecast_input(project_id: int) -> dict:
    dataset = _assemble_final_effort_dataset(_read_project_rows(project_id=project_id), include_target=False)
    if dataset.empty:
        raise ValueError(f"Project not found for final effort forecast: {project_id}")
    row = dataset.iloc[0]
    return {
        "projectId": int(row["project_id"]),
        "projectName": row["project_name"],
        "currentPlannedEffort": _to_number(row["current_planned_effort"]),
        "features": row[FORECAST_FEATURE_COLUMNS].to_dict(),
    }


def build_final_budget_forecast_input(project_id: int) -> dict:
    dataset = _assemble_final_budget_dataset(_read_project_rows(project_id=project_id), include_target=False)
    if dataset.empty:
        raise ValueError(f"Project not found for final budget forecast: {project_id}")
    row = dataset.iloc[0]
    return {
        "projectId": int(row["project_id"]),
        "projectName": row["project_name"],
        "currentPlannedBudget": _to_number(row["current_planned_budget"]),
        "features": row[FORECAST_FEATURE_COLUMNS].to_dict(),
    }
