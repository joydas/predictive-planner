import json
import traceback

from feature_engineering.merge_training_dataset import merge_training_dataset
from training.train_effort_model import train_effort_model
from training.train_schedule_risk_model import train_schedule_risk_model
from training.train_staffing_model import train_staffing_model
from utils.feature_utils import utc_timestamp
from utils.paths import DATASETS_DIR, MODELS_DIR, ensure_runtime_dirs


FEATURE_VERSION = "project_features_v1"
DATASET_VERSION = "project_training_dataset_v1"


def run_training_pipeline() -> dict:
    ensure_runtime_dirs()
    dataset_path = DATASETS_DIR / "project_training_dataset.csv"
    dataset = merge_training_dataset(output_path=dataset_path)

    metadata = {
        "training_timestamp": utc_timestamp(),
        "dataset_version": DATASET_VERSION,
        "feature_version": FEATURE_VERSION,
        "dataset_path": str(dataset_path),
        "row_count": int(len(dataset)),
        "evaluation_metrics": {},
        "warnings": [],
    }

    trainers = {
        "effort": train_effort_model,
        "staffing": train_staffing_model,
        "schedule_risk": train_schedule_risk_model,
    }
    for name, trainer in trainers.items():
        try:
            metadata["evaluation_metrics"][name] = trainer(dataset_path)
        except Exception as exc:
            metadata["warnings"].append({"model": name, "error": str(exc)})
            traceback.print_exc()

    metadata_path = MODELS_DIR / "model_metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


if __name__ == "__main__":
    print(json.dumps(run_training_pipeline(), indent=2))
