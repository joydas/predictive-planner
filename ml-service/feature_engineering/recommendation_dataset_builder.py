import pandas as pd

from config.db import get_engine
from feature_engineering.build_cr_features import build_cr_features
from feature_engineering.build_project_features import build_project_features_from_projects
from feature_engineering.build_team_features import build_team_features
from feature_engineering.build_workflow_features import (
    build_cr_workflow_features,
    build_project_workflow_features,
)
from utils.feature_utils import read_table
from utils.paths import DATASETS_DIR, ensure_runtime_dirs


TEST_DATA_TYPE = "TEST DATA"


def load_recommendation_projects(engine=None) -> pd.DataFrame:
    engine = engine or get_engine()
    projects = read_table(engine, "project")
    if projects.empty:
        return projects

    projects = projects.copy()
    projects["_project_type_for_filter"] = _project_type_for_filter(projects, engine)
    projects["_recommendation_completed"] = _completed_mask(projects)
    return projects[projects["_project_type_for_filter"] != TEST_DATA_TYPE].copy()


def _project_type_for_filter(projects: pd.DataFrame, engine) -> pd.Series:
    project_type = projects.get("project_type", pd.Series("", index=projects.index)).fillna("").astype(str)
    project_type = project_type.str.strip().str.upper()

    if "project_type_id" not in projects.columns:
        return project_type

    project_types = read_table(engine, "md_project_type")
    if project_types.empty or not {"project_type_id", "project_type_name"}.issubset(project_types.columns):
        return project_type

    lookup = project_types.set_index("project_type_id")["project_type_name"].fillna("").astype(str).str.strip().str.upper()
    type_from_id = projects["project_type_id"].map(lookup).fillna("").astype(str)
    return project_type.mask(project_type == "", type_from_id)


def _completed_mask(projects: pd.DataFrame) -> pd.Series:
    completed = pd.Series(False, index=projects.index)
    for column in ["actual_end_date", "actual_completion_date"]:
        if column in projects.columns:
            completed = completed | pd.to_datetime(projects[column], errors="coerce").notna()
    return completed


def summarize_recommendation_population(projects: pd.DataFrame, excluded_test_data: int = 0) -> dict:
    if projects.empty:
        return {"active": 0, "completed": 0, "total": 0, "excluded_test_data": int(excluded_test_data)}
    completed = int(projects.get("_recommendation_completed", pd.Series(False, index=projects.index)).sum())
    total = int(len(projects))
    return {
        "active": total - completed,
        "completed": completed,
        "total": total,
        "excluded_test_data": int(excluded_test_data),
    }


def _merge_left(base: pd.DataFrame, next_df: pd.DataFrame) -> pd.DataFrame:
    if next_df.empty or "project_id" not in next_df.columns:
        return base
    return base.merge(next_df, on="project_id", how="left")


def build_recommendation_training_dataset(engine=None, output_path=None) -> pd.DataFrame:
    ensure_runtime_dirs()
    engine = engine or get_engine()
    output_path = output_path or DATASETS_DIR / "project_training_dataset.csv"

    raw_projects = read_table(engine, "project")
    excluded_test_data = 0
    if not raw_projects.empty:
        raw_projects = raw_projects.copy()
        raw_projects["_project_type_for_filter"] = _project_type_for_filter(raw_projects, engine)
        excluded_test_data = int((raw_projects["_project_type_for_filter"] == TEST_DATA_TYPE).sum())

    projects = load_recommendation_projects(engine)
    population = summarize_recommendation_population(projects, excluded_test_data=excluded_test_data)
    dataset = build_project_features_from_projects(projects)
    if dataset.empty:
        dataset.attrs["population"] = population
        dataset.to_csv(output_path, index=False)
        return dataset

    for frame in [
        build_team_features(engine),
        build_cr_features(engine),
        build_project_workflow_features(engine),
        build_cr_workflow_features(engine),
    ]:
        dataset = _merge_left(dataset, frame)

    dataset = dataset.fillna(0)
    dataset["actual_effort_hours"] = dataset["planned_effort"] + dataset.get("total_effort_increase", 0)
    duration = dataset["project_duration"].replace(0, pd.NA)
    dataset["schedule_variance_percent"] = (
        dataset.get("total_schedule_increase", 0) / duration * 100
    ).fillna(0).clip(lower=0)
    dataset["delayed_flag"] = (dataset["schedule_variance_percent"] > 10).astype(int)

    drop_columns = [col for col in dataset.columns if "comment" in col.lower() or "description" in col.lower()]
    drop_columns.extend(
        [
            "project_id",
            "source_draft_id",
            "project_code",
            "project_name",
            "client_name",
            "project_status",
            "project_status_group",
            "_project_type_for_filter",
            "_recommendation_completed",
            "target_staff_Unknown",
        ]
    )
    dataset = dataset.drop(columns=drop_columns, errors="ignore")

    null_ratio = dataset.isna().mean()
    dataset = dataset.loc[:, null_ratio < 0.7]
    dataset.attrs["population"] = population
    dataset.to_csv(output_path, index=False)
    return dataset
