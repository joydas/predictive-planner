import pandas as pd

from config.db import get_engine
from utils.feature_utils import canonical_role_name, normalize_role, numeric, read_sql_or_empty
from utils.paths import REPORTS_DIR, ensure_runtime_dirs


from sqlalchemy import text


def load_staffing_rows(engine=None, organization_id: int | None = None) -> pd.DataFrame:
    engine = engine or get_engine()
    if organization_id is not None:
        rows = read_sql_or_empty(
            engine,
            text("""
            SELECT
              pts.project_id,
              COALESCE(mr.role_name, pts.role) AS source_role,
              pts.resource_count
            FROM project_team_snapshot pts
            LEFT JOIN md_role mr ON mr.role_id = pts.role_id
            WHERE pts.organization_id = :org_id
            """).bindparams(org_id=organization_id)
        )
    else:
        rows = read_sql_or_empty(
            engine,
            """
            SELECT
              pts.project_id,
              COALESCE(mr.role_name, pts.role) AS source_role,
              pts.resource_count
            FROM project_team_snapshot pts
            LEFT JOIN md_role mr ON mr.role_id = pts.role_id
            """,
        )
    if rows.empty:
        return pd.DataFrame(columns=["project_id", "role", "resource_count"])
    rows["resource_count"] = numeric(rows["resource_count"])
    rows["role"] = rows["source_role"].map(canonical_role_name)
    rows["normalized_role"] = rows["role"].map(normalize_role)
    return rows


def analyze_staffing_distribution(engine=None, output_path=None, organization_id: int | None = None) -> pd.DataFrame:
    ensure_runtime_dirs(organization_id=organization_id)
    output_path = output_path or (REPORTS_DIR / str(organization_id) / "staffing_distribution_report.csv" if organization_id else REPORTS_DIR / "staffing_distribution_report.csv")
    rows = load_staffing_rows(engine, organization_id=organization_id)
    if rows.empty:
        report = pd.DataFrame(columns=["Role", "Project Count", "Avg Count", "Non-Zero Frequency", "Dominance Flag"])
        report.to_csv(output_path, index=False)
        return report

    project_count = rows["project_id"].nunique()
    grouped = rows.groupby("role").agg(
        **{
            "Project Count": ("project_id", "nunique"),
            "Avg Count": ("resource_count", "mean"),
        }
    ).reset_index().rename(columns={"role": "Role"})
    grouped["Non-Zero Frequency"] = grouped["Project Count"] / max(project_count, 1)
    grouped["Dominance Flag"] = grouped["Non-Zero Frequency"].apply(
        lambda value: "DOMINANT" if value >= 0.9 else ("SPARSE" if value <= 0.05 else "")
    )
    grouped = grouped.sort_values(["Project Count", "Avg Count"], ascending=[False, False])
    grouped.to_csv(output_path, index=False)
    return grouped


if __name__ == "__main__":
    report = analyze_staffing_distribution()
    print(report.to_string(index=False))
