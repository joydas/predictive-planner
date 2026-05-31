import math

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from feature_engineering.forecast_feature_builder import (
    FORECAST_FEATURE_COLUMNS,
    MIN_FORECAST_TRAINING_ROWS,
    ON_TIME_PROBABILITY_FEATURE_COLUMNS,
    build_on_time_probability_training_dataset,
)
from training.common import build_preprocessor, save_artifact
from utils.paths import DATASETS_DIR, MODELS_DIR


ARTIFACT_NAME = "on_time_delivery_probability_model.pkl"
TARGET_COLUMN = "on_time_delivery_flag"
DATASET_FILE = "on_time_delivery_probability_training_dataset.csv"


def _load_model_artifact(path):
    if not path.exists():
        return None
    try:
        return joblib.load(path)
    except Exception:
        return None


def _add_forecast_features(df):
    if df.empty:
        return df

    completion_artifact = _load_model_artifact(MODELS_DIR / "completion_forecast_model.pkl")
    effort_artifact = _load_model_artifact(MODELS_DIR / "final_effort_forecast_model.pkl")
    budget_artifact = _load_model_artifact(MODELS_DIR / "final_budget_forecast_model.pkl")

    def _forecast_values(row):
        row_values = {}
        frame = np.array([[row.get(column, 0) for column in FORECAST_FEATURE_COLUMNS]])
        for name, artifact in [
            ("forecast_delay_days", completion_artifact),
            ("forecast_final_effort", effort_artifact),
            ("forecast_final_budget", budget_artifact),
        ]:
            if artifact and artifact.get("pipeline") is not None:
                try:
                    pipeline = artifact["pipeline"]
                    prediction = pipeline.predict(np.array(frame))[0]
                    row_values[name] = float(max(prediction, 0))
                except Exception:
                    row_values[name] = 0.0
            else:
                row_values[name] = 0.0
        return row_values

    predictions = df.apply(lambda row: _forecast_values(row), axis=1)
    forecast_df = pd.DataFrame(list(predictions))
    return pd.concat([df.reset_index(drop=True), forecast_df.reset_index(drop=True)], axis=1)


def _split_dataset(df):
    if len(df) >= 8:
        return train_test_split(df[ON_TIME_PROBABILITY_FEATURE_COLUMNS], df[TARGET_COLUMN], test_size=0.25, random_state=42)
    return df[ON_TIME_PROBABILITY_FEATURE_COLUMNS], df[ON_TIME_PROBABILITY_FEATURE_COLUMNS], df[TARGET_COLUMN], df[TARGET_COLUMN]


def train_on_time_delivery_probability_model(dataset_path=None) -> dict:
    dataset_path = dataset_path or DATASETS_DIR / DATASET_FILE
    df = build_on_time_probability_training_dataset(output_path=dataset_path)
    if len(df) < MIN_FORECAST_TRAINING_ROWS or df[TARGET_COLUMN].nunique() < 2:
        metrics = {
            "trained": False,
            "training_rows": int(len(df)),
            "minimum_required_rows": MIN_FORECAST_TRAINING_ROWS,
            "message": "Insufficient historical project data available for on-time probability modeling.",
        }
        save_artifact(
            MODELS_DIR / ARTIFACT_NAME,
            {
                "pipeline": None,
                "feature_columns": ON_TIME_PROBABILITY_FEATURE_COLUMNS,
                "target": TARGET_COLUMN,
                "metrics": metrics,
                "minimum_required_rows": MIN_FORECAST_TRAINING_ROWS,
                "training_rows": int(len(df)),
            },
        )
        return metrics

    df = _add_forecast_features(df)
    df = df.fillna(0)

    X_train, X_test, y_train, y_test = _split_dataset(df)
    pipeline = Pipeline(
        steps=[
            ("preprocessor", build_preprocessor(df, ON_TIME_PROBABILITY_FEATURE_COLUMNS)),
            ("model", RandomForestClassifier(n_estimators=180, random_state=42, class_weight="balanced")),
        ]
    )
    pipeline.fit(X_train, y_train)

    predictions = pipeline.predict(X_test)
    probabilities = pipeline.predict_proba(X_test)[:, 1] if hasattr(pipeline.named_steps["model"], "predict_proba") else np.zeros(len(X_test))

    metrics = {
        "trained": True,
        "training_rows": int(len(df)),
        "accuracy": float(accuracy_score(y_test, predictions)),
        "precision": float(precision_score(y_test, predictions, zero_division=0)),
        "recall": float(recall_score(y_test, predictions, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, probabilities)) if len(np.unique(y_test)) > 1 else 0.0,
        "residual_std": float(np.std(y_test - predictions)) if len(y_test) else 0.0,
    }
    save_artifact(
        MODELS_DIR / ARTIFACT_NAME,
        {
            "pipeline": pipeline,
            "feature_columns": ON_TIME_PROBABILITY_FEATURE_COLUMNS,
            "target": TARGET_COLUMN,
            "metrics": metrics,
            "minimum_required_rows": MIN_FORECAST_TRAINING_ROWS,
            "training_rows": int(len(df)),
        },
    )
    return metrics


if __name__ == "__main__":
    print(train_on_time_delivery_probability_model())
