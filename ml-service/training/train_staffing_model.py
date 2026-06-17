import math

import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import Pipeline

from training.common import build_preprocessor, feature_columns_for_dataset, save_artifact
from utils.paths import DATASETS_DIR, MODELS_DIR, get_tenant_datasets_dir, get_tenant_models_dir


MIN_NON_ZERO_TARGETS = 10


def _effective_min_non_zero_targets(row_count: int) -> int:
    if row_count <= 0:
        return MIN_NON_ZERO_TARGETS
    return min(MIN_NON_ZERO_TARGETS, max(1, math.ceil(row_count * 0.25)))


def train_staffing_model(dataset_path=None, organization_id: int | None = None) -> dict:
    if dataset_path is None:
        dataset_path = get_tenant_datasets_dir(organization_id) / "project_training_dataset.csv" if organization_id else DATASETS_DIR / "project_training_dataset.csv"
    
    df = pd.read_csv(dataset_path)
    target_columns = [
        col
        for col in df.columns
        if col.startswith("target_staff_") and col not in {"target_staff_Unknown"}
    ]
    if df.empty or not target_columns:
        raise ValueError("Training dataset is empty or missing staffing target columns")

    effective_min_non_zero_targets = _effective_min_non_zero_targets(len(df))
    target_non_zero_counts = {
        col: int((pd.to_numeric(df[col], errors="coerce").fillna(0) > 0).sum())
        for col in target_columns
    }
    valid_target_columns = [
        col
        for col in target_columns
        if target_non_zero_counts[col] >= effective_min_non_zero_targets
    ]
    excluded_target_columns = [
        col
        for col in target_columns
        if col not in valid_target_columns
    ]

    print(f"Configured maximum non-zero staffing targets required: {MIN_NON_ZERO_TARGETS}")
    print(f"Effective non-zero staffing targets required: {effective_min_non_zero_targets}")
    print("Excluded sparse staffing targets:")
    if excluded_target_columns:
        for col in excluded_target_columns:
            print(f"- {col} ({target_non_zero_counts[col]})")
    else:
        print("- none")
    print("Training staffing targets:")
    for col in valid_target_columns:
        print(f"- {col} ({target_non_zero_counts[col]})")

    if not valid_target_columns:
        raise ValueError(
            f"No staffing target columns have at least {effective_min_non_zero_targets} non-zero rows"
        )

    features = feature_columns_for_dataset(df)
    X = df[features]
    y = df[valid_target_columns].apply(pd.to_numeric, errors="coerce").fillna(0)

    if len(df) >= 5:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42)
    else:
        X_train, X_test, y_train, y_test = X, X, y, y

    pipeline = Pipeline(
        steps=[
            ("preprocessor", build_preprocessor(df, features)),
            ("model", MultiOutputRegressor(RandomForestRegressor(n_estimators=120, random_state=42))),
        ]
    )
    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_test)

    metrics = {
        role.replace("target_staff_", ""): float(mean_absolute_error(y_test[role], predictions[:, idx]))
        for idx, role in enumerate(valid_target_columns)
    }
    save_artifact(
        (get_tenant_models_dir(organization_id) / "staffing_model.joblib" if organization_id else MODELS_DIR / "staffing_model.joblib"),
        {
            "pipeline": pipeline,
            "feature_columns": features,
            "target_columns": valid_target_columns,
            "excluded_target_columns": {
                col: target_non_zero_counts[col]
                for col in excluded_target_columns
            },
            "target_non_zero_counts": target_non_zero_counts,
            "min_non_zero_targets": MIN_NON_ZERO_TARGETS,
            "effective_min_non_zero_targets": effective_min_non_zero_targets,
            "metrics": metrics,
        },
    )
    return {"mae_per_role": metrics}


if __name__ == "__main__":
    print(train_staffing_model())
