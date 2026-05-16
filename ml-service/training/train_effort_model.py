import math

import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from training.common import build_preprocessor, feature_columns_for_dataset, save_artifact
from utils.paths import DATASETS_DIR, MODELS_DIR


def train_effort_model(dataset_path=None) -> dict:
    dataset_path = dataset_path or DATASETS_DIR / "project_training_dataset.csv"
    df = pd.read_csv(dataset_path)
    if df.empty or "actual_effort_hours" not in df.columns:
        raise ValueError("Training dataset is empty or missing actual_effort_hours")

    features = feature_columns_for_dataset(df)
    X = df[features]
    y = pd.to_numeric(df["actual_effort_hours"], errors="coerce").fillna(0)

    if len(df) >= 5:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42)
    else:
        X_train, X_test, y_train, y_test = X, X, y, y

    pipeline = Pipeline(
        steps=[
            ("preprocessor", build_preprocessor(df, features)),
            ("model", RandomForestRegressor(n_estimators=120, random_state=42, min_samples_leaf=1)),
        ]
    )
    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_test)

    metrics = {
        "rmse": float(math.sqrt(mean_squared_error(y_test, predictions))),
        "mae": float(mean_absolute_error(y_test, predictions)),
        "r2": float(r2_score(y_test, predictions)) if len(y_test) > 1 else 0.0,
    }
    save_artifact(
        MODELS_DIR / "effort_model.joblib",
        {"pipeline": pipeline, "feature_columns": features, "target": "actual_effort_hours", "metrics": metrics},
    )
    return metrics


if __name__ == "__main__":
    print(train_effort_model())
