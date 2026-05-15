import pandas as pd

from config.db import get_engine
from utils.feature_utils import normalize_role, numeric, read_table


def build_team_features(engine=None) -> pd.DataFrame:
    engine = engine or get_engine()
    team = read_table(engine, "project_team_snapshot")
    if team.empty:
        return pd.DataFrame(columns=["project_id"])

    team["resource_count"] = numeric(team.get("resource_count", pd.Series(dtype=float)))
    team["avg_experience_years"] = numeric(team.get("avg_experience_years", pd.Series(dtype=float)))
    team["normalized_role"] = team["role"].map(normalize_role)
    team["location_normalized"] = team["location"].fillna("").astype(str).str.upper()

    grouped = team.groupby("project_id", dropna=False)
    base = grouped.agg(
        total_team_size=("resource_count", "sum"),
        avg_team_experience=("avg_experience_years", "mean"),
    ).reset_index()

    offshore = team[team["location_normalized"].str.contains("OFFSHORE", na=False)]
    offshore_counts = offshore.groupby("project_id")["resource_count"].sum().rename("offshore_count")
    base = base.merge(offshore_counts, on="project_id", how="left")
    base["offshore_count"] = base["offshore_count"].fillna(0)
    base["offshore_ratio"] = (base["offshore_count"] / base["total_team_size"].replace(0, pd.NA)).fillna(0)
    base = base.drop(columns=["offshore_count"])

    role_counts = team.pivot_table(
        index="project_id",
        columns="normalized_role",
        values="resource_count",
        aggfunc="sum",
        fill_value=0,
    )
    role_counts.columns = [f"target_staff_{role}" for role in role_counts.columns]
    role_counts = role_counts.reset_index()

    for role in ["PM", "QA", "Dev"]:
        source_cols = [col for col in role_counts.columns if col.upper().startswith(f"TARGET_STAFF_{role.upper()}")]
        base[f"{role}_count"] = role_counts[source_cols].sum(axis=1) if source_cols else 0

    return base.merge(role_counts, on="project_id", how="left").fillna(0)
