from __future__ import annotations

from datetime import date
import time
from typing import Any

import numpy as np
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

ON_TIME_PROBABILITY_FEATURE_COLUMNS = [
    *FORECAST_FEATURE_COLUMNS,
    "forecast_delay_days",
    "forecast_final_effort",
    "forecast_final_budget",
]

MIN_FORECAST_TRAINING_ROWS = 5
SIMILAR_PROJECT_FEATURE_COLUMNS = [
    "industry",
    "technology",
    "complexity",
    "project_type",
    "planned_duration_days",
    "current_planned_effort",
    "current_planned_budget",
    "current_planned_team_size",
    "approved_cr_count",
    "total_cr_effort_impact",
    "total_cr_budget_impact",
    "total_cr_duration_impact",
    "average_progress_velocity",
    "progress_snapshot_count",
]
_SIMILAR_COMPLETED_CACHE: dict[str, Any] = {"expires_at": 0, "dataset": None}
_SIMILAR_CACHE_SECONDS = 300
_EXPLAINABILITY_CACHE: dict[str, Any] = {"expires_at": 0, "benchmark": None}
_EXPLAINABILITY_CACHE_SECONDS = 300


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


def _read_project_rows(project_id: int | None = None, completed_only: bool = False, organization_id: int | None = None) -> pd.DataFrame:
    project_filter = "AND p.project_id = :project_id" if project_id is not None else ""
    completed_filter = "AND COALESCE(p.workflow_status, pd.workflow_status) IN ('COMPLETE', 'CLOSED', 'COMPLETED') AND COALESCE(p.actual_completion_date, latest_completion.actual_completion_date) IS NOT NULL" if completed_only else ""
    regression_filter = _regression_filter("p")
    tenant_filter = "AND p.organization_id = :org_id" if organization_id is not None else ""
    test_data_filter = "AND UPPER(COALESCE(p.project_type, JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.basicInfo.project_type')), '')) <> 'TEST DATA'"
    
    params = {"project_id": project_id} if project_id is not None else {}
    if organization_id is not None:
        params["org_id"] = organization_id

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
            LEFT JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
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
              {tenant_filter}
              {regression_filter}
              {test_data_filter}
            """
        ),
        get_engine(),
        params=params,
    )


def summarize_forecast_training_population(organization_id: int | None = None) -> dict[str, int]:
    regression_filter = _regression_filter("p")
    tenant_filter = "AND p.organization_id = :org_id" if organization_id is not None else ""
    params = {"org_id": organization_id} if organization_id is not None else {}
    
    test_type_expression = """
      UPPER(COALESCE(
        p.project_type,
        mpt.project_type_name,
        JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.basicInfo.project_type')),
        ''
      ))
    """
    counts = pd.read_sql_query(
        text(
            f"""
            SELECT
              SUM(CASE WHEN {test_type_expression} = 'TEST DATA' THEN 1 ELSE 0 END) AS excluded_test_data,
              SUM(CASE WHEN {test_type_expression} <> 'TEST DATA' THEN 1 ELSE 0 END) AS completed
            FROM project p
            LEFT JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
            LEFT JOIN md_project_type mpt ON mpt.project_type_id = p.project_type_id
            LEFT JOIN (
              SELECT pch.project_id, DATE(pch.completed_at) AS actual_completion_date
              FROM project_completion_history pch
              INNER JOIN (
                SELECT project_id, MAX(completion_id) AS completion_id
                FROM project_completion_history
                GROUP BY project_id
              ) latest ON latest.completion_id = pch.completion_id
            ) latest_completion ON latest_completion.project_id = p.project_id
            WHERE COALESCE(p.workflow_status, pd.workflow_status) IN ('COMPLETE', 'CLOSED', 'COMPLETED')
              AND COALESCE(p.actual_completion_date, latest_completion.actual_completion_date) IS NOT NULL
              {tenant_filter}
              {regression_filter}
            """
        ),
        get_engine(),
        params=params,
    )
    if counts.empty:
        return {"completed": 0, "total": 0, "excluded_test_data": 0}
    completed = int(counts.iloc[0].get("completed") or 0)
    excluded_test_data = int(counts.iloc[0].get("excluded_test_data") or 0)
    return {"completed": completed, "total": completed, "excluded_test_data": excluded_test_data}


def _read_cr_rows(project_ids: list[int], organization_id: int | None = None) -> pd.DataFrame:
    if not project_ids:
        return pd.DataFrame()
    tenant_filter = "AND organization_id = :org_id" if organization_id is not None else ""
    params = {"project_ids": project_ids}
    if organization_id is not None:
        params["org_id"] = organization_id

    return pd.read_sql_query(
        text(
            f"""
            SELECT
              project_id,
              COUNT(*) AS approved_cr_count,
              SUM(COALESCE(estimated_effort_hours, 0)) AS total_cr_effort_impact,
              SUM(COALESCE(budget_impact, estimated_cost_impact, 0)) AS total_cr_budget_impact,
              SUM(COALESCE(schedule_impact_days, 0)) AS total_cr_duration_impact
            FROM change_request
            WHERE workflow_status = 'APPROVED'
              AND project_id IN :project_ids
              {tenant_filter}
            GROUP BY project_id
            """
        ).bindparams(bindparam("project_ids", expanding=True)),
        get_engine(),
        params=params,
    )


def _read_progress_rows(project_ids: list[int], organization_id: int | None = None) -> pd.DataFrame:
    if not project_ids:
        return pd.DataFrame()
    tenant_filter = "AND organization_id = :org_id" if organization_id is not None else ""
    params = {"project_ids": project_ids}
    if organization_id is not None:
        params["org_id"] = organization_id

    return pd.read_sql_query(
        text(
            f"""
            SELECT
              project_id,
              snapshot_date,
              actual_completion_percent,
              actual_effort_pd,
              actual_budget,
              actual_team_size
            FROM project_progress_snapshot
            WHERE project_id IN :project_ids
              {tenant_filter}
            ORDER BY project_id, snapshot_date, snapshot_id
            """
        ).bindparams(bindparam("project_ids", expanding=True)),
        get_engine(),
        params=params,
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


def _assemble_features(projects: pd.DataFrame, include_target: bool = False, organization_id: int | None = None) -> pd.DataFrame:
    if projects.empty:
        return pd.DataFrame()

    project_ids = [int(value) for value in projects["project_id"].tolist()]
    cr = _read_cr_rows(project_ids, organization_id=organization_id)
    progress = _progress_features(_read_progress_rows(project_ids, organization_id=organization_id), project_ids)
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


def _assemble_final_effort_dataset(projects: pd.DataFrame, include_target: bool = False, organization_id: int | None = None) -> pd.DataFrame:
    if projects.empty:
        return pd.DataFrame()

    dataset = _assemble_features(projects, include_target=False, organization_id=organization_id)
    if not include_target:
        return dataset

    project_ids = [int(value) for value in projects["project_id"].tolist()]
    latest_actuals = _latest_progress_actuals(_read_progress_rows(project_ids, organization_id=organization_id), project_ids)
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


def _assemble_final_budget_dataset(projects: pd.DataFrame, include_target: bool = False, organization_id: int | None = None) -> pd.DataFrame:
    if projects.empty:
        return pd.DataFrame()

    dataset = _assemble_features(projects, include_target=False, organization_id=organization_id)
    if not include_target:
        return dataset

    project_ids = [int(value) for value in projects["project_id"].tolist()]
    latest_actuals = _latest_progress_actuals(_read_progress_rows(project_ids, organization_id=organization_id), project_ids)
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


def build_completion_forecast_training_dataset(output_path=None, organization_id: int | None = None) -> pd.DataFrame:
    dataset = _assemble_features(_read_project_rows(completed_only=True, organization_id=organization_id), include_target=True, organization_id=organization_id)
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        dataset.to_csv(output_path, index=False)
    return dataset


def build_final_effort_forecast_training_dataset(output_path=None, organization_id: int | None = None) -> pd.DataFrame:
    dataset = _assemble_final_effort_dataset(_read_project_rows(completed_only=True, organization_id=organization_id), include_target=True, organization_id=organization_id)
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        dataset.to_csv(output_path, index=False)
    return dataset


def build_final_budget_forecast_training_dataset(output_path=None, organization_id: int | None = None) -> pd.DataFrame:
    dataset = _assemble_final_budget_dataset(_read_project_rows(completed_only=True, organization_id=organization_id), include_target=True, organization_id=organization_id)
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        dataset.to_csv(output_path, index=False)
    return dataset


def build_on_time_probability_training_dataset(output_path=None, organization_id: int | None = None) -> pd.DataFrame:
    projects = _read_project_rows(completed_only=True, organization_id=organization_id)
    if projects.empty:
        dataset = pd.DataFrame()
        if output_path is not None:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            dataset.to_csv(output_path, index=False)
        return dataset

    dataset = _assemble_features(projects, include_target=False, organization_id=organization_id)
    dataset = dataset.merge(
        projects[["project_id", "actual_completion_date"]],
        on="project_id",
        how="left",
    )
    dataset["on_time_delivery_flag"] = dataset.apply(
        lambda row: int(
            _to_date(row["actual_completion_date"]) is not None
            and _to_date(row["planned_completion_date"]) is not None
            and _to_date(row["actual_completion_date"]) <= _to_date(row["planned_completion_date"])
        ),
        axis=1,
    )
    dataset = dataset[dataset["on_time_delivery_flag"].notna()]

    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        dataset.to_csv(output_path, index=False)
    return dataset


def build_on_time_probability_input(project_id: int, organization_id: int | None = None) -> dict:
    dataset = _assemble_features(_read_project_rows(project_id=project_id, organization_id=organization_id), include_target=False, organization_id=organization_id)
    if dataset.empty:
        raise ValueError(f"Project not found for on-time probability input: {project_id}")
    row = dataset.iloc[0]
    return {
        "projectId": int(row["project_id"]),
        "projectName": row["project_name"],
        "plannedCompletionDate": str(row["planned_completion_date"] or "")[:10],
        "features": row[FORECAST_FEATURE_COLUMNS].to_dict(),
    }


def build_completion_forecast_input(project_id: int, organization_id: int | None = None) -> dict:
    dataset = _assemble_features(_read_project_rows(project_id=project_id, organization_id=organization_id), include_target=False, organization_id=organization_id)
    if dataset.empty:
        raise ValueError(f"Project not found for completion forecast: {project_id}")
    row = dataset.iloc[0]
    return {
        "projectId": int(row["project_id"]),
        "projectName": row["project_name"],
        "plannedCompletionDate": str(row["planned_completion_date"] or "")[:10],
        "features": row[FORECAST_FEATURE_COLUMNS].to_dict(),
    }


def build_final_effort_forecast_input(project_id: int, organization_id: int | None = None) -> dict:
    dataset = _assemble_final_effort_dataset(_read_project_rows(project_id=project_id, organization_id=organization_id), include_target=False, organization_id=organization_id)
    if dataset.empty:
        raise ValueError(f"Project not found for final effort forecast: {project_id}")
    row = dataset.iloc[0]
    return {
        "projectId": int(row["project_id"]),
        "projectName": row["project_name"],
        "currentPlannedEffort": _to_number(row["current_planned_effort"]),
        "features": row[FORECAST_FEATURE_COLUMNS].to_dict(),
    }


def build_final_budget_forecast_input(project_id: int, organization_id: int | None = None) -> dict:
    dataset = _assemble_final_budget_dataset(_read_project_rows(project_id=project_id, organization_id=organization_id), include_target=False, organization_id=organization_id)
    if dataset.empty:
        raise ValueError(f"Project not found for final budget forecast: {project_id}")
    row = dataset.iloc[0]
    return {
        "projectId": int(row["project_id"]),
        "projectName": row["project_name"],
        "currentPlannedBudget": _to_number(row["current_planned_budget"]),
        "features": row[FORECAST_FEATURE_COLUMNS].to_dict(),
    }


def _completed_feature_benchmark(organization_id: int | None = None) -> dict[str, float]:
    now = time.time()
    cache_key = f"benchmark_{organization_id}"
    cached = _EXPLAINABILITY_CACHE.get(cache_key)
    if cached is not None and now < _EXPLAINABILITY_CACHE.get(f"{cache_key}_expires_at", 0):
        return dict(cached)

    dataset = _assemble_features(_read_project_rows(completed_only=True, organization_id=organization_id), include_target=False, organization_id=organization_id)
    numeric = [column for column in FORECAST_FEATURE_COLUMNS if column not in {"industry", "technology", "project_type"}]
    benchmark = {}
    for column in numeric:
        if column in dataset.columns and not dataset.empty:
            benchmark[column] = float(pd.to_numeric(dataset[column], errors="coerce").fillna(0).median())
        else:
            benchmark[column] = 0.0
    _EXPLAINABILITY_CACHE.update({cache_key: benchmark, f"{cache_key}_expires_at": now + _EXPLAINABILITY_CACHE_SECONDS})
    return dict(benchmark)


def _driver(label: str, score: float) -> dict[str, Any]:
    return {"label": label, "score": float(score)}


def _top_driver_labels(drivers: list[dict[str, Any]], fallback: list[str], limit: int = 3) -> list[str]:
    ranked = [item for item in drivers if item.get("score", 0) > 0]
    ranked.sort(key=lambda item: item["score"], reverse=True)
    labels = []
    for item in ranked:
        label = str(item["label"])
        if label not in labels:
            labels.append(label)
        if len(labels) >= limit:
            return labels
    for label in fallback:
        if label not in labels:
            labels.append(label)
        if len(labels) >= limit:
            break
    return labels


def build_forecast_explainability(project_id: int, organization_id: int | None = None) -> dict:
    dataset = _assemble_features(_read_project_rows(project_id=project_id, organization_id=organization_id), include_target=False, organization_id=organization_id)
    if dataset.empty:
        raise ValueError(f"Project not found for explainability: {project_id}")

    row = dataset.iloc[0]
    features = row[FORECAST_FEATURE_COLUMNS].to_dict()
    benchmark = _completed_feature_benchmark(organization_id=organization_id)

    def value(name: str) -> float:
        return _to_number(features.get(name), 0)

    def median(name: str, fallback: float = 0) -> float:
        return max(_to_number(benchmark.get(name), fallback), fallback)

    complexity = value("complexity")
    cr_count = value("approved_cr_count")
    cr_effort = value("total_cr_effort_impact")
    cr_budget = value("total_cr_budget_impact")
    cr_duration = value("total_cr_duration_impact")
    progress_count = value("progress_snapshot_count")
    velocity = value("average_progress_velocity")
    velocity_trend = value("progress_velocity_trend")
    latest_completion = value("latest_completion_percent")
    planned_effort = value("current_planned_effort")
    planned_budget = value("current_planned_budget")
    team_size = value("current_planned_team_size")
    planned_duration = value("planned_duration_days")
    effort_to_date = value("actual_effort_to_date")
    budget_to_date = value("actual_budget_to_date")

    completion_drivers = [
        _driver("Progress velocity below portfolio average", max(0, median("average_progress_velocity") - velocity) * 100),
        _driver("Progress trend is slowing", max(0, -velocity_trend) * 100),
        _driver("Multiple approved CRs", max(0, cr_count - 1) * 8),
        _driver("Approved CRs extended the schedule", max(0, cr_duration)),
        _driver("High complexity project", max(0, complexity - 2) * 6),
        _driver("Limited progress history", max(0, 3 - progress_count) * 5),
        _driver("Current completion is still low", max(0, 50 - latest_completion) / 5),
    ]

    effort_drivers = [
        _driver("High planned effort", max(0, planned_effort - median("current_planned_effort")) / max(median("current_planned_effort", 1), 1) * 20),
        _driver("Large team size", max(0, team_size - median("current_planned_team_size")) * 4),
        _driver("Approved CR effort impact", max(0, cr_effort) / 20),
        _driver("High complexity project", max(0, complexity - 2) * 6),
        _driver("Actual effort to date is significant", max(0, effort_to_date - median("actual_effort_to_date")) / max(median("actual_effort_to_date", 1), 1) * 12),
        _driver("Long project duration", max(0, planned_duration - median("planned_duration_days")) / 15),
    ]

    budget_drivers = [
        _driver("High planned budget", max(0, planned_budget - median("current_planned_budget")) / max(median("current_planned_budget", 1), 1) * 20),
        _driver("Budget increase from approved CRs", max(0, cr_budget) / max(median("total_cr_budget_impact", 10000), 10000) * 12),
        _driver("Large staffing footprint", max(0, team_size - median("current_planned_team_size")) * 4),
        _driver("Extended duration", max(0, planned_duration + cr_duration - median("planned_duration_days")) / 15),
        _driver("Actual spend to date is significant", max(0, budget_to_date - median("actual_budget_to_date")) / max(median("actual_budget_to_date", 1), 1) * 12),
        _driver("High complexity project", max(0, complexity - 2) * 5),
    ]

    return {
        "projectId": int(row["project_id"]),
        "projectName": row["project_name"],
        "completionDrivers": _top_driver_labels(
            completion_drivers,
            ["Project complexity", "Progress velocity", "Approved CR history"],
        ),
        "effortDrivers": _top_driver_labels(
            effort_drivers,
            ["Planned effort", "Team size", "Approved CR effort impact"],
        ),
        "budgetDrivers": _top_driver_labels(
            budget_drivers,
            ["Planned budget", "Staffing footprint", "Approved CR budget impact"],
        ),
    }


def _completed_similarity_dataset(organization_id: int | None = None) -> pd.DataFrame:
    now = time.time()
    cache_key = f"dataset_{organization_id}"
    cached = _SIMILAR_COMPLETED_CACHE.get(cache_key)
    if cached is not None and now < _SIMILAR_COMPLETED_CACHE.get(f"{cache_key}_expires_at", 0):
        return cached.copy()

    projects = _read_project_rows(completed_only=True, organization_id=organization_id)
    dataset = _assemble_features(projects, include_target=False, organization_id=organization_id)
    if dataset.empty:
        _SIMILAR_COMPLETED_CACHE.update({cache_key: dataset, f"{cache_key}_expires_at": now + _SIMILAR_CACHE_SECONDS})
        return dataset.copy()

    actuals = projects[
        [
            "project_id",
            "actual_effort",
            "actual_budget",
            "start_date",
            "actual_completion_date",
            "planned_completion_date",
        ]
    ].copy()
    actuals["actual_duration_days"] = actuals.apply(
        lambda row: _days_between(row["start_date"], row["actual_completion_date"], inclusive=True),
        axis=1,
    )
    actuals["planned_duration_days_detail"] = actuals.apply(
        lambda row: _days_between(row["start_date"], row["planned_completion_date"], inclusive=True),
        axis=1,
    )
    dataset = dataset.merge(actuals, on="project_id", how="left")
    _SIMILAR_COMPLETED_CACHE.update({cache_key: dataset, f"{cache_key}_expires_at": now + _SIMILAR_CACHE_SECONDS})
    return dataset.copy()


def _prepare_similarity_matrix(target: pd.DataFrame, candidates: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    feature_columns = SIMILAR_PROJECT_FEATURE_COLUMNS
    combined = pd.concat(
        [target[feature_columns], candidates[feature_columns]],
        ignore_index=True,
    )
    categorical = ["industry", "technology", "project_type"]
    numeric = [column for column in feature_columns if column not in categorical]

    encoded = pd.get_dummies(combined, columns=categorical, dummy_na=False)
    for column in numeric:
        encoded[column] = pd.to_numeric(encoded[column], errors="coerce").fillna(0)

    numeric_frame = encoded[numeric].astype(float)
    means = numeric_frame.mean(axis=0)
    stds = numeric_frame.std(axis=0).replace(0, 1)
    encoded[numeric] = (numeric_frame - means) / stds

    matrix = encoded.astype(float).to_numpy()
    target_vector = matrix[:1]
    candidate_matrix = matrix[1:]
    return target_vector, candidate_matrix


def _cosine_similarity(target_vector: np.ndarray, candidate_matrix: np.ndarray) -> np.ndarray:
    target_norm = np.linalg.norm(target_vector, axis=1)[0]
    candidate_norms = np.linalg.norm(candidate_matrix, axis=1)
    denominator = target_norm * candidate_norms
    denominator[denominator == 0] = 1
    return (candidate_matrix @ target_vector[0]) / denominator


def find_similar_historical_projects(
    project_id: int,
    top_n: int = 3,
    candidate_project_ids: list[int] | None = None,
    organization_id: int | None = None,
) -> list[dict]:
    target = _assemble_features(_read_project_rows(project_id=project_id, organization_id=organization_id), include_target=False, organization_id=organization_id)
    if target.empty:
        raise ValueError(f"Project not found for similar historical projects: {project_id}")

    candidates = _completed_similarity_dataset(organization_id=organization_id)
    if candidates.empty:
        return []

    candidates = candidates[candidates["project_id"] != int(project_id)].copy()
    if candidate_project_ids is not None:
        allowed_ids = {int(value) for value in candidate_project_ids if value}
        candidates = candidates[candidates["project_id"].isin(allowed_ids)].copy()
    if candidates.empty:
        return []

    target_vector, candidate_matrix = _prepare_similarity_matrix(target, candidates)
    scores = _cosine_similarity(target_vector, candidate_matrix)
    ranked = candidates.assign(_similarity=scores).sort_values("_similarity", ascending=False).head(top_n)

    results = []
    for _, row in ranked.iterrows():
        similarity = int(round(max(0, min(100, ((float(row["_similarity"]) + 1) / 2) * 100))))
        results.append(
            {
                "projectId": int(row["project_id"]),
                "projectName": row["project_name"],
                "similarity": similarity,
                "industry": row["industry"],
                "technology": row["technology"],
                "projectType": row["project_type"],
                "plannedEffort": _to_number(row["current_planned_effort"]),
                "actualEffort": _to_number(row["actual_effort"]),
                "plannedBudget": _to_number(row["current_planned_budget"]),
                "actualBudget": _to_number(row["actual_budget"]),
                "plannedDurationDays": int(_to_number(row["planned_duration_days_detail"] or row["planned_duration_days"], 0)),
                "actualDurationDays": int(_to_number(row["actual_duration_days"], 0)),
                "completedOnTime": int(_to_number(row["actual_duration_days"], 0)) <= int(_to_number(row["planned_duration_days_detail"] or row["planned_duration_days"], 0)),
                "plannedTeamSize": _to_number(row["current_planned_team_size"]),
                "approvedCrCount": int(_to_number(row["approved_cr_count"], 0)),
                "totalCrEffortImpact": _to_number(row["total_cr_effort_impact"]),
                "totalCrBudgetImpact": _to_number(row["total_cr_budget_impact"]),
                "totalCrDurationImpact": _to_number(row["total_cr_duration_impact"]),
            }
        )
    return results
