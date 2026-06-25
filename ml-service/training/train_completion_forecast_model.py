import math

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from feature_engineering.forecast_feature_builder import (
    FORECAST_FEATURE_COLUMNS,
    MIN_FORECAST_TRAINING_ROWS,
    build_completion_forecast_training_dataset,
)
from training.common import build_preprocessor, save_artifact
from utils.paths import DATASETS_DIR, MODELS_DIR, get_tenant_datasets_dir, get_tenant_models_dir


def _split_dataset(df):
    if len(df) >= 8:
        return train_test_split(df[FORECAST_FEATURE_COLUMNS], df["completion_delay_days"], test_size=0.25, random_state=42)
    return df[FORECAST_FEATURE_COLUMNS], df[FORECAST_FEATURE_COLUMNS], df["completion_delay_days"], df["completion_delay_days"]


def train_completion_forecast_model(dataset_path=None, organization_id: int | None = None) -> dict:
    if dataset_path is None:
        dataset_path = get_tenant_datasets_dir(organization_id) / "completion_forecast_training_dataset.csv" if organization_id else DATASETS_DIR / "completion_forecast_training_dataset.csv"
    
    df = build_completion_forecast_training_dataset(output_path=dataset_path, organization_id=organization_id)
    if len(df) < MIN_FORECAST_TRAINING_ROWS:
        metrics = {
            "trained": False,
            "training_rows": int(len(df)),
            "minimum_required_rows": MIN_FORECAST_TRAINING_ROWS,
            "message": "Insufficient historical project data available for forecasting *.",
        }
        save_artifact(
            (get_tenant_models_dir(organization_id) / "completion_forecast_model.pkl" if organization_id else MODELS_DIR / "completion_forecast_model.pkl"),
            {
                "pipeline": None,
                "feature_columns": FORECAST_FEATURE_COLUMNS,
                "target": "completion_delay_days",
                "metrics": metrics,
                "minimum_required_rows": MIN_FORECAST_TRAINING_ROWS,
                "training_rows": int(len(df)),
            },
        )
        return metrics

    X_train, X_test, y_train, y_test = _split_dataset(df)
    pipeline = Pipeline(
        steps=[
            ("preprocessor", build_preprocessor(df, FORECAST_FEATURE_COLUMNS)),
            ("model", RandomForestRegressor(n_estimators=180, random_state=42, min_samples_leaf=1)),
        ]
    )
    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_test)

    residuals = np.asarray(y_test) - np.asarray(predictions)
    residual_std = float(np.std(residuals)) if len(residuals) else 0.0
    mae = float(mean_absolute_error(y_test, predictions))
    metrics = {
        "trained": True,
        "training_rows": int(len(df)),
        "rmse": float(math.sqrt(mean_squared_error(y_test, predictions))),
        "mae": mae,
        "r2": float(r2_score(y_test, predictions)) if len(y_test) > 1 else 0.0,
        "residual_std": residual_std,
    }
    save_artifact(
        (get_tenant_models_dir(organization_id) / "completion_forecast_model.pkl" if organization_id else MODELS_DIR / "completion_forecast_model.pkl"),
        {
            "pipeline": pipeline,
            "feature_columns": FORECAST_FEATURE_COLUMNS,
            "target": "completion_delay_days",
            "metrics": metrics,
            "minimum_required_rows": MIN_FORECAST_TRAINING_ROWS,
            "training_rows": int(len(df)),
        },
    )
    return metrics


if __name__ == "__main__":
    print(train_completion_forecast_model())
