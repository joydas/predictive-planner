import pandas as pd

from config.db import get_engine
from utils.feature_utils import numeric, parse_json, read_table, safe_days


def build_project_features_from_projects(projects: pd.DataFrame) -> pd.DataFrame:
    if projects.empty:
        return pd.DataFrame()

    rows = []
    for _, row in projects.iterrows():
        approved = parse_json(row.get("approved_data"))
        delivery = approved.get("deliveryDetails", {}) or {}
        technology = approved.get("technology", {}) or {}
        risks = approved.get("risks", {}) or {}

        tech_stack = row.get("technology_stack") or technology.get("technology_stack") or ""
        technology_count = len([part for part in str(tech_stack).replace(";", ",").split(",") if part.strip()])

        start_date = row.get("start_date") or delivery.get("start_date")
        planned_end_date = row.get("planned_end_date") or delivery.get("planned_end_date")
        duration = 0
        if start_date and planned_end_date:
            duration = safe_days(pd.Series([start_date]), pd.Series([planned_end_date])).iloc[0]

        rows.append(
            {
                "project_id": row.get("project_id"),
                "project_code": row.get("project_code"),
                "project_name": row.get("project_name"),
                "client_name": row.get("client_name"),
                "project_status": row.get("project_status", ""),
                "project_status_group": row.get("project_status_group", row.get("project_status", "")),
                "industry": row.get("industry") or "",
                "project_type": row.get("project_type") or "",
                "delivery_model": row.get("delivery_model") or "",
                "technology_stack": tech_stack,
                "complexity": row.get("complexity") or row.get("complexity", 0),
                "estimated_team_size": row.get("estimated_team_size") or row.get("estimated_team_size", 0),
                "planned_effort": row.get("planned_effort") or row.get("planned_effort", 0),
                "budget": row.get("budget") or row.get("budget", 0),
                "predicted_hours": row.get("predicted_hours") or row.get("predicted_hours", 0),
                "project_duration": duration,
                "technology_count": technology_count,
                "dependency_count": risks.get("dependency_count", 0),
                "requirement_stability_index": risks.get("requirement_stability_index", 0),
                "criticality": risks.get("criticality", ""),
            }
        )

    features = pd.DataFrame(rows)
    for column in [
        "complexity",
        "estimated_team_size",
        "planned_effort",
        "budget",
        "predicted_hours",
        "project_duration",
        "technology_count",
        "dependency_count",
        "requirement_stability_index",
    ]:
        features[column] = numeric(features[column])

    return features


def build_project_features(engine=None, organization_id: int | None = None) -> pd.DataFrame:
    engine = engine or get_engine()
    projects = read_table(engine, "project", organization_id=organization_id)
    return build_project_features_from_projects(projects)
