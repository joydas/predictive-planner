import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import Pipeline

from training.common import build_preprocessor, feature_columns_for_dataset, save_artifact
from utils.paths import DATASETS_DIR, MODELS_DIR


def train_staffing_model(dataset_path=None) -> dict:
    dataset_path = dataset_path or DATASETS_DIR / "project_training_dataset.csv"
    df = pd.read_csv(dataset_path)
    target_columns = [
        col
        for col in df.columns
        if col.startswith("target_staff_") and col not in {"target_staff_Unknown"}
    ]
    if df.empty or not target_columns:
        raise ValueError("Training dataset is empty or missing staffing target columns")

    features = feature_columns_for_dataset(df)
    X = df[features]
    y = df[target_columns].apply(pd.to_numeric, errors="coerce").fillna(0)

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
        for idx, role in enumerate(target_columns)
    }
    save_artifact(
        MODELS_DIR / "staffing_model.joblib",
        {"pipeline": pipeline, "feature_columns": features, "target_columns": target_columns, "metrics": metrics},
    )
    return {"mae_per_role": metrics}


if __name__ == "__main__":
    print(train_staffing_model())
