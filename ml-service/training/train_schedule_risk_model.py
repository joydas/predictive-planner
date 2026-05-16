import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from training.common import build_preprocessor, feature_columns_for_dataset, save_artifact
from utils.paths import DATASETS_DIR, MODELS_DIR


def train_schedule_risk_model(dataset_path=None) -> dict:
    dataset_path = dataset_path or DATASETS_DIR / "project_training_dataset.csv"
    df = pd.read_csv(dataset_path)
    if df.empty or "delayed_flag" not in df.columns:
        raise ValueError("Training dataset is empty or missing delayed_flag")

    features = feature_columns_for_dataset(df)
    X = df[features]
    y = pd.to_numeric(df["delayed_flag"], errors="coerce").fillna(0).astype(int)

    class_counts = y.value_counts()
    stratify = y if len(class_counts) > 1 and class_counts.min() >= 2 and len(df) >= 8 else None
    if len(df) >= 5:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.25, random_state=42, stratify=stratify
        )
    else:
        X_train, X_test, y_train, y_test = X, X, y, y

    pipeline = Pipeline(
        steps=[
            ("preprocessor", build_preprocessor(df, features)),
            ("model", RandomForestClassifier(n_estimators=120, random_state=42, class_weight="balanced")),
        ]
    )
    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_test)

    metrics = {
        "accuracy": float(accuracy_score(y_test, predictions)),
        "precision": float(precision_score(y_test, predictions, zero_division=0)),
        "recall": float(recall_score(y_test, predictions, zero_division=0)),
    }
    save_artifact(
        MODELS_DIR / "schedule_risk_model.joblib",
        {"pipeline": pipeline, "feature_columns": features, "target": "delayed_flag", "metrics": metrics},
    )
    return metrics


if __name__ == "__main__":
    print(train_schedule_risk_model())
