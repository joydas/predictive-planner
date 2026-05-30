import json
import os
import shutil
import traceback

from feature_engineering.merge_training_dataset import merge_training_dataset
from training.train_effort_model import train_effort_model
from training.train_completion_forecast_model import train_completion_forecast_model
from training.train_final_budget_forecast_model import train_final_budget_forecast_model
from training.train_final_effort_forecast_model import train_final_effort_forecast_model
from training.train_schedule_risk_model import train_schedule_risk_model
from training.train_staffing_model import train_staffing_model
from training.analyze_staffing_distribution import analyze_staffing_distribution
from training.generate_target_distribution_report import generate_target_distribution_report
from training.validate_staffing_diversity import validate_staffing_diversity
from utils.feature_utils import utc_timestamp
from utils.paths import DATASETS_DIR, MODELS_DIR, REPORTS_DIR, ensure_runtime_dirs


FEATURE_VERSION = "project_features_v1"
DATASET_VERSION = "project_training_dataset_v1"
ARTIFACT_FILES = [
    "effort_model.joblib",
    "staffing_model.joblib",
    "schedule_risk_model.joblib",
    "completion_forecast_model.pkl",
    "final_effort_forecast_model.pkl",
    "final_budget_forecast_model.pkl",
    "model_metadata.json",
]


def _model_version(timestamp: str) -> str:
    return f"ml-{timestamp.replace(':', '').replace('-', '').replace('.', '').replace('+', 'Z')}"


def _publish_artifacts(staging_dir) -> None:
    for artifact_name in ARTIFACT_FILES:
        source = staging_dir / artifact_name
        if not source.exists():
            raise FileNotFoundError(f"Expected trained artifact was not created: {source}")

    for artifact_name in ARTIFACT_FILES:
        os.replace(staging_dir / artifact_name, MODELS_DIR / artifact_name)


def run_training_pipeline(publish: bool = True, job_id: str | None = None, log=print) -> dict:
    ensure_runtime_dirs()
    dataset_path = DATASETS_DIR / "project_training_dataset.csv"
    staffing_distribution_path = REPORTS_DIR / "staffing_distribution_report.csv"
    target_distribution_path = REPORTS_DIR / "target_distribution_report.csv"
    staffing_validation_path = REPORTS_DIR / "staffing_diversity_validation_report.csv"
    training_timestamp = utc_timestamp()
    staging_dir = MODELS_DIR / ".staging" / (job_id or _model_version(training_timestamp))
    previous_output_dir = os.environ.get("MODEL_OUTPUT_DIR")

    log("Reading project data")
    analyze_staffing_distribution(output_path=staffing_distribution_path)
    log("Preparing training dataset")
    dataset = merge_training_dataset(output_path=dataset_path)
    generate_target_distribution_report(output_path=target_distribution_path)
    validation_report = validate_staffing_diversity(output_path=staffing_validation_path)

    metadata = {
        "model_version": _model_version(training_timestamp),
        "training_timestamp": training_timestamp,
        "dataset_version": DATASET_VERSION,
        "feature_version": FEATURE_VERSION,
        "dataset_path": str(dataset_path),
        "project_count": int(dataset["project_id"].nunique()) if "project_id" in dataset.columns else int(len(dataset)),
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

    try:
        if publish:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            staging_dir.mkdir(parents=True, exist_ok=True)
            os.environ["MODEL_OUTPUT_DIR"] = str(staging_dir)

        trainers = [
            ("staffing", "Training staffing model", train_staffing_model),
            ("effort", "Training effort model", train_effort_model),
            ("schedule_risk", "Training risk model", train_schedule_risk_model),
            ("completion_forecast", "Training completion forecast model", train_completion_forecast_model),
            ("final_effort_forecast", "Training final effort forecast model", train_final_effort_forecast_model),
            ("final_budget_forecast", "Training final budget forecast model", train_final_budget_forecast_model),
        ]
        for name, message, trainer in trainers:
            log(message)
            metadata["evaluation_metrics"][name] = trainer(dataset_path)

        log("Saving model artifacts")
        metadata_path = (staging_dir if publish else MODELS_DIR) / "model_metadata.json"
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        if publish:
            _publish_artifacts(staging_dir)
        log("Completed")
    except Exception:
        traceback.print_exc()
        raise
    finally:
        if previous_output_dir:
            os.environ["MODEL_OUTPUT_DIR"] = previous_output_dir
        else:
            os.environ.pop("MODEL_OUTPUT_DIR", None)
        if publish and staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)

    return metadata


if __name__ == "__main__":
    print(json.dumps(run_training_pipeline(), indent=2))
