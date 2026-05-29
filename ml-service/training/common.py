import os
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from utils.feature_utils import model_feature_columns, split_feature_types


def build_preprocessor(df: pd.DataFrame, feature_columns: list[str]) -> ColumnTransformer:
    numeric_cols, categorical_cols = split_feature_types(df, feature_columns)

    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]
    )

    return ColumnTransformer(
        transformers=[
            ("numeric", numeric_pipeline, numeric_cols),
            ("categorical", categorical_pipeline, categorical_cols),
        ],
        remainder="drop",
    )


def feature_columns_for_dataset(df: pd.DataFrame) -> list[str]:
    return model_feature_columns(df)


def save_artifact(path, artifact: dict[str, Any]) -> None:
    output_dir = os.getenv("MODEL_OUTPUT_DIR")
    target_path = Path(output_dir) / Path(path).name if output_dir else Path(path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, target_path)
