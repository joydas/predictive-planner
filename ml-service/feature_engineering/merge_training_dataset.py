import pandas as pd

from feature_engineering.recommendation_dataset_builder import build_recommendation_training_dataset


def merge_training_dataset(engine=None, output_path=None) -> pd.DataFrame:
    return build_recommendation_training_dataset(engine=engine, output_path=output_path)


if __name__ == "__main__":
    df = merge_training_dataset()
    print(f"Generated dataset with {len(df)} rows and {len(df.columns)} columns")
