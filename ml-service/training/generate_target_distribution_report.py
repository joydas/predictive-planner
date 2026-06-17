import pandas as pd

from feature_engineering.build_team_features import build_team_features
from utils.paths import REPORTS_DIR, ensure_runtime_dirs


def generate_target_distribution_report(engine=None, output_path=None, organization_id: int | None = None) -> pd.DataFrame:
    ensure_runtime_dirs(organization_id=organization_id)
    output_path = output_path or (REPORTS_DIR / str(organization_id) / "target_distribution_report.csv" if organization_id else REPORTS_DIR / "target_distribution_report.csv")
    team_features = build_team_features(engine, organization_id=organization_id)
    target_columns = [column for column in team_features.columns if column.startswith("target_staff_")]

    rows = []
    project_count = len(team_features)
    for column in target_columns:
        values = pd.to_numeric(team_features[column], errors="coerce").fillna(0)
        non_zero = int((values > 0).sum())
        rows.append(
            {
                "Role": column.replace("target_staff_", ""),
                "Non-Zero Projects": non_zero,
                "Avg Staffing": float(values[values > 0].mean()) if non_zero else 0.0,
                "Non-Zero Frequency": non_zero / max(project_count, 1),
            }
        )

    report = pd.DataFrame(rows).sort_values(["Non-Zero Projects", "Avg Staffing"], ascending=[False, False])
    report.to_csv(output_path, index=False)
    return report


if __name__ == "__main__":
    print(generate_target_distribution_report().to_string(index=False))
