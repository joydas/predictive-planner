import pandas as pd

from config.db import get_engine
from feature_engineering.build_cr_features import build_cr_features
from feature_engineering.build_project_features import build_project_features
from feature_engineering.build_team_features import build_team_features
from feature_engineering.build_workflow_features import (
    build_cr_workflow_features,
    build_project_workflow_features,
)
from utils.paths import DATASETS_DIR, ensure_runtime_dirs


def _merge_left(base: pd.DataFrame, next_df: pd.DataFrame) -> pd.DataFrame:
    if next_df.empty or "project_id" not in next_df.columns:
        return base
    return base.merge(next_df, on="project_id", how="left")


def merge_training_dataset(engine=None, output_path=None) -> pd.DataFrame:
    ensure_runtime_dirs()
    engine = engine or get_engine()
    output_path = output_path or DATASETS_DIR / "project_training_dataset.csv"

    dataset = build_project_features(engine)
    if dataset.empty:
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
        ["project_id", "source_draft_id", "project_code", "project_name", "client_name", "target_staff_Unknown"]
    )
    dataset = dataset.drop(columns=drop_columns, errors="ignore")

    null_ratio = dataset.isna().mean()
    dataset = dataset.loc[:, null_ratio < 0.7]
    dataset.to_csv(output_path, index=False)
    return dataset


if __name__ == "__main__":
    df = merge_training_dataset()
    print(f"Generated dataset with {len(df)} rows and {len(df.columns)} columns")
