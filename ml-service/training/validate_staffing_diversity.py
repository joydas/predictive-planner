import pandas as pd

from feature_engineering.build_team_features import build_team_features
from feature_engineering.build_project_features import build_project_features
from utils.paths import REPORTS_DIR, ensure_runtime_dirs


def _has_role(row: pd.Series, role_fragment: str) -> bool:
    fragment = role_fragment.lower()
    for column, value in row.items():
        if column.startswith("target_staff_") and fragment in column.lower() and float(value or 0) > 0:
            return True
    return False


def validate_staffing_diversity(engine=None, output_path=None, organization_id: int | None = None) -> pd.DataFrame:
    ensure_runtime_dirs(organization_id=organization_id)
    output_path = output_path or (REPORTS_DIR / str(organization_id) / "staffing_diversity_validation_report.csv" if organization_id else REPORTS_DIR / "staffing_diversity_validation_report.csv")
    projects = build_project_features(engine, organization_id=organization_id)
    teams = build_team_features(engine, organization_id=organization_id)
    if projects.empty or teams.empty:
        report = pd.DataFrame(columns=["project_id", "issue"])
        report.to_csv(output_path, index=False)
        return report

    dataset = projects.merge(teams, on="project_id", how="left").fillna(0)
    issues = []
    for _, row in dataset.iterrows():
        context = " ".join(
            str(row.get(column, ""))
            for column in ["industry", "technology_stack", "delivery_model", "project_type"]
        ).lower()
        target_columns = [column for column in dataset.columns if column.startswith("target_staff_")]
        non_zero_roles = [column for column in target_columns if float(row.get(column, 0) or 0) > 0]
        if len(non_zero_roles) <= 1:
            issues.append({"project_id": row.get("project_id"), "issue": "PM-only or single-role staffing"})
        if "react" in context and not _has_role(row, "React"):
            issues.append({"project_id": row.get("project_id"), "issue": "React project missing React staffing"})
        if "python" in context and not _has_role(row, "Python"):
            issues.append({"project_id": row.get("project_id"), "issue": "Python project missing Python staffing"})
        if any(token in context for token in ["aws", "azure", "gcp", "cloud"]) and not (
            _has_role(row, "DevOps") or _has_role(row, "Cloud")
        ):
            issues.append({"project_id": row.get("project_id"), "issue": "Cloud project missing DevOps/Cloud staffing"})
        if not _has_role(row, "QA") and not _has_role(row, "Tester"):
            issues.append({"project_id": row.get("project_id"), "issue": "Project missing QA/testing staffing"})

    report = pd.DataFrame(issues)
    report.to_csv(output_path, index=False)
    return report


if __name__ == "__main__":
    report = validate_staffing_diversity()
    print(report.to_string(index=False) if not report.empty else "No staffing diversity issues detected")
