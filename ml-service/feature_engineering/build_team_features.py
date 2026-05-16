import pandas as pd

from config.db import get_engine
from utils.feature_utils import canonical_role_name, normalize_role, numeric, read_sql_or_empty, read_table


def _load_team_snapshot(engine) -> pd.DataFrame:
    team = read_sql_or_empty(
        engine,
        """
        SELECT
          pts.project_id,
          COALESCE(mr.role_name, pts.role) AS source_role,
          pts.role,
          pts.resource_count,
          pts.avg_experience_years,
          pts.location,
          pts.location_type
        FROM project_team_snapshot pts
        LEFT JOIN md_role mr ON mr.role_id = pts.role_id
        """,
    )
    if not team.empty:
        return team
    return read_table(engine, "project_team_snapshot")


def _active_role_targets(engine) -> list[str]:
    roles = read_sql_or_empty(
        engine,
        """
        SELECT role_name
        FROM md_role
        WHERE COALESCE(active_flag, 1) = 1
        ORDER BY role_name
        """,
    )
    if roles.empty or "role_name" not in roles:
        return []
    return sorted({normalize_role(role) for role in roles["role_name"].dropna()})


def build_team_features(engine=None) -> pd.DataFrame:
    engine = engine or get_engine()
    team = _load_team_snapshot(engine)
    if team.empty:
        return pd.DataFrame(columns=["project_id"])

    team["resource_count"] = numeric(team.get("resource_count", pd.Series(dtype=float)))
    team["avg_experience_years"] = numeric(team.get("avg_experience_years", pd.Series(dtype=float)))
    fallback_role = team["role"] if "role" in team.columns else pd.Series("", index=team.index)
    source_role = team["source_role"] if "source_role" in team.columns else fallback_role
    team["source_role"] = source_role.fillna(fallback_role).fillna("")
    team["canonical_role"] = team["source_role"].map(canonical_role_name)
    team["normalized_role"] = team["canonical_role"].map(normalize_role)
    location_source = team.get("location_type", pd.Series(dtype=str)).fillna("").astype(str)
    team["location_normalized"] = (location_source + " " + team.get("location", pd.Series(dtype=str)).fillna("").astype(str)).str.upper()

    active_role_targets = _active_role_targets(engine)
    if active_role_targets:
        team = team[team["normalized_role"].isin(active_role_targets)].copy()
    if team.empty:
        return pd.DataFrame(columns=["project_id", *[f"target_staff_{role}" for role in active_role_targets]])

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

    for role in active_role_targets:
        column = f"target_staff_{role}"
        if column not in role_counts.columns:
            role_counts[column] = 0

    for role in ["PM", "QA", "Dev"]:
        source_cols = [col for col in role_counts.columns if col.upper().startswith(f"TARGET_STAFF_{role.upper()}")]
        base[f"{role}_count"] = role_counts[source_cols].sum(axis=1) if source_cols else 0

    return base.merge(role_counts, on="project_id", how="left").fillna(0)
