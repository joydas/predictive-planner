import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from config.db import get_engine
from feature_engineering.forecast_feature_builder import _read_project_rows, _assemble_features

projects = _read_project_rows(completed_only=True, organization_id=1)
print("Initial projects count:", len(projects))

df = projects.copy()
project_ids = [int(value) for value in df["project_id"].tolist()]
from feature_engineering.forecast_feature_builder import _read_cr_rows, _read_progress_rows, _progress_features

cr = _read_cr_rows(project_ids, organization_id=1)
print("CR count:", len(cr))

raw_progress = _read_progress_rows(project_ids, organization_id=1)
print("Raw progress rows count:", len(raw_progress))

progress = _progress_features(raw_progress, project_ids)
print("Processed progress features count:", len(progress))

df = df.merge(cr, on="project_id", how="left").merge(progress, on="project_id", how="left")
print("Merged df count:", len(df))

from feature_engineering.forecast_feature_builder import _days_between
df["planned_duration_days"] = df.apply(
    lambda row: _days_between(row["start_date"], row["planned_completion_date"], inclusive=True),
    axis=1,
)
print("planned_duration_days count:", len(df))

df["completion_delay_days"] = df.apply(
    lambda row: (
        pd.to_datetime(row["actual_completion_date"]) - pd.to_datetime(row["planned_completion_date"])
    ).days
    if pd.notna(row["actual_completion_date"]) and pd.notna(row["planned_completion_date"])
    else None,
    axis=1,
)
notna_delay = df[df["completion_delay_days"].notna()]
print("After completion_delay_days notna count:", len(notna_delay))

# Let's inspect the dates for a few rows
print("\nSample dates:")
print(df[["project_id", "planned_completion_date", "actual_completion_date", "completion_delay_days"]].head(10))
