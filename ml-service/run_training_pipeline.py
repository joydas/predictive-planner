import json
import traceback

from feature_engineering.merge_training_dataset import merge_training_dataset
from training.train_effort_model import train_effort_model
from training.train_schedule_risk_model import train_schedule_risk_model
from training.train_staffing_model import train_staffing_model
from training.analyze_staffing_distribution import analyze_staffing_distribution
from training.generate_target_distribution_report import generate_target_distribution_report
from training.validate_staffing_diversity import validate_staffing_diversity
from utils.feature_utils import utc_timestamp
from utils.paths import DATASETS_DIR, MODELS_DIR, REPORTS_DIR, ensure_runtime_dirs


FEATURE_VERSION = "project_features_v1"
DATASET_VERSION = "project_training_dataset_v1"


def run_training_pipeline() -> dict:
    ensure_runtime_dirs()
    dataset_path = DATASETS_DIR / "project_training_dataset.csv"
    staffing_distribution_path = REPORTS_DIR / "staffing_distribution_report.csv"
    target_distribution_path = REPORTS_DIR / "target_distribution_report.csv"
    staffing_validation_path = REPORTS_DIR / "staffing_diversity_validation_report.csv"

    analyze_staffing_distribution(output_path=staffing_distribution_path)
    dataset = merge_training_dataset(output_path=dataset_path)
    generate_target_distribution_report(output_path=target_distribution_path)
    validation_report = validate_staffing_diversity(output_path=staffing_validation_path)

    metadata = {
        "training_timestamp": utc_timestamp(),
        "dataset_version": DATASET_VERSION,
        "feature_version": FEATURE_VERSION,
        "dataset_path": str(dataset_path),
        "row_count": int(len(dataset)),
        "evaluation_metrics": {},
        "warnings": [],
        "reports": {
            "staffing_distribution": str(staffing_distribution_path),
            "target_distribution": str(target_distribution_path),
            "staffing_diversity_validation": str(staffing_validation_path),
        },
    }
    if not validation_report.empty:
        metadata["warnings"].append(
            {
                "report": "staffing_diversity_validation",
                "issue_count": int(len(validation_report)),
                "path": str(staffing_validation_path),
            }
        )

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
