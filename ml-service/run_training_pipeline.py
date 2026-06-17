import json
import os
import shutil
import traceback

from sqlalchemy import text
from feature_engineering.merge_training_dataset import merge_training_dataset
from feature_engineering.forecast_feature_builder import summarize_forecast_training_population
from training.train_effort_model import train_effort_model
from training.train_completion_forecast_model import train_completion_forecast_model
from training.train_final_budget_forecast_model import train_final_budget_forecast_model
from training.train_final_effort_forecast_model import train_final_effort_forecast_model
from training.train_on_time_delivery_probability_model import train_on_time_delivery_probability_model
from training.train_schedule_risk_model import train_schedule_risk_model
from training.train_staffing_model import train_staffing_model
from training.analyze_staffing_distribution import analyze_staffing_distribution
from training.generate_target_distribution_report import generate_target_distribution_report
from training.validate_staffing_diversity import validate_staffing_diversity
from utils.feature_utils import utc_timestamp
from utils.paths import DATASETS_DIR, MODELS_DIR, REPORTS_DIR, ensure_runtime_dirs, get_tenant_datasets_dir, get_tenant_models_dir, get_tenant_reports_dir
from config.db import get_engine


FEATURE_VERSION = "project_features_v1"
DATASET_VERSION = "project_training_dataset_v1"
ARTIFACT_FILES = [
    "effort_model.joblib",
    "staffing_model.joblib",
    "schedule_risk_model.joblib",
    "completion_forecast_model.pkl",
    "final_effort_forecast_model.pkl",
    "final_budget_forecast_model.pkl",
    "on_time_delivery_probability_model.pkl",
    "model_metadata.json",
]


def _model_version(timestamp: str) -> str:
    return f"ml-{timestamp.replace(':', '').replace('-', '').replace('.', '').replace('+', 'Z')}"


def _publish_artifacts(staging_dir, organization_id: int | None = None) -> None:
    target_dir = get_tenant_models_dir(organization_id) if organization_id else MODELS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    
    for artifact_name in ARTIFACT_FILES:
        source = staging_dir / artifact_name
        if not source.exists():
            continue

        os.replace(source, target_dir / artifact_name)


def _register_models(metadata: dict, organization_id: int | None) -> None:
    if not organization_id:
        return
        
    engine = get_engine()
    with engine.begin() as conn:
        for model_type, metrics in metadata.get("evaluation_metrics", {}).items():
            conn.execute(
                text("""
                    INSERT INTO ml_model_registry 
                        (organization_id, model_type, model_version, training_record_count, project_count, model_path, evaluation_metrics, metadata)
                    VALUES 
                        (:org_id, :type, :version, :records, :projects, :path, :metrics, :meta)
                """),
                {
                    "org_id": organization_id,
                    "type": model_type,
                    "version": metadata["model_version"],
                    "records": metadata["row_count"],
                    "projects": metadata["project_count"],
                    "path": str(get_tenant_models_dir(organization_id)),
                    "metrics": json.dumps(metrics),
                    "meta": json.dumps({
                        "feature_version": metadata["feature_version"],
                        "dataset_version": metadata["dataset_version"],
                        "training_timestamp": metadata["training_timestamp"]
                    })
                }
            )


def _log_recommendation_population(log, population: dict) -> None:
    active = int(population.get("active", 0))
    completed = int(population.get("completed", 0))
    total = int(population.get("total", active + completed))
    excluded_test_data = int(population.get("excluded_test_data", 0))
    log("Recommendation Training Dataset")
    log(f"Projects Used: {total}")
    log(f"Active: {active}")
    log(f"Completed: {completed}")
    log(f"Excluded TEST DATA: {excluded_test_data}")


def _log_forecast_population(log, metrics: dict | None, population: dict | None = None) -> None:
    completed = int((metrics or {}).get("training_rows", 0))
    excluded_test_data = int((population or {}).get("excluded_test_data", 0))
    log("Forecast Training Dataset")
    log(f"Projects Used: {completed}")
    log(f"Completed: {completed}")
    log(f"Excluded TEST DATA: {excluded_test_data}")


def run_training_pipeline(publish: bool = True, job_id: str | None = None, log=print, organization_id: int | None = None) -> dict:
    ensure_runtime_dirs(organization_id=organization_id)
    
    base_datasets_dir = get_tenant_datasets_dir(organization_id) if organization_id else DATASETS_DIR
    base_reports_dir = get_tenant_reports_dir(organization_id) if organization_id else REPORTS_DIR
    base_models_dir = get_tenant_models_dir(organization_id) if organization_id else MODELS_DIR

    recommendation_dataset_path = base_datasets_dir / "project_training_dataset.csv"
    staffing_distribution_path = base_reports_dir / "staffing_distribution_report.csv"
    target_distribution_path = base_reports_dir / "target_distribution_report.csv"
    staffing_validation_path = base_reports_dir / "staffing_diversity_validation_report.csv"
    
    training_timestamp = utc_timestamp()
    staging_dir = base_models_dir / ".staging" / (job_id or _model_version(training_timestamp))
    previous_output_dir = os.environ.get("MODEL_OUTPUT_DIR")

    log(f"Reading project data for organization {organization_id or 'GLOBAL'}")
    analyze_staffing_distribution(output_path=staffing_distribution_path, organization_id=organization_id)
    log("Preparing recommendation training dataset")
    dataset = merge_training_dataset(output_path=recommendation_dataset_path, organization_id=organization_id)
    recommendation_population = dataset.attrs.get("population", {})
    _log_recommendation_population(log, recommendation_population)
    forecast_population = summarize_forecast_training_population(organization_id=organization_id)
    generate_target_distribution_report(output_path=target_distribution_path, organization_id=organization_id)
    validation_report = validate_staffing_diversity(output_path=staffing_validation_path, organization_id=organization_id)

    metadata = {
        "organization_id": organization_id,
        "model_version": _model_version(training_timestamp),
        "training_timestamp": training_timestamp,
        "dataset_version": DATASET_VERSION,
        "feature_version": FEATURE_VERSION,
        "dataset_path": str(recommendation_dataset_path),
        "recommendation_training_population": recommendation_population,
        "forecast_training_population": forecast_population,
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
            ("staffing", "Training staffing model", train_staffing_model, recommendation_dataset_path),
            ("effort", "Training effort model", train_effort_model, recommendation_dataset_path),
            ("schedule_risk", "Training risk model", train_schedule_risk_model, recommendation_dataset_path),
            ("completion_forecast", "Training completion forecast model", train_completion_forecast_model, None),
            ("final_effort_forecast", "Training final effort forecast model", train_final_effort_forecast_model, None),
            ("final_budget_forecast", "Training final budget forecast model", train_final_budget_forecast_model, None),
            ("on_time_probability", "Training on-time delivery probability model", train_on_time_delivery_probability_model, None),
        ]
        for name, message, trainer, trainer_dataset_path in trainers:
            log(message)
            try:
                metrics = trainer(trainer_dataset_path, organization_id=organization_id) if trainer_dataset_path is not None else trainer(organization_id=organization_id)
                metadata["evaluation_metrics"][name] = metrics
                if name == "completion_forecast":
                    _log_forecast_population(log, metrics, forecast_population)
            except Exception as e:
                log(f"Warning: Failed to train {name} model: {str(e)}")
                metadata["warnings"].append(f"Failed to train {name}: {str(e)}")

        log("Saving model artifacts")
        metadata_path = (staging_dir if publish else base_models_dir) / "model_metadata.json"
        metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        if publish:
            _publish_artifacts(staging_dir, organization_id=organization_id)
            _register_models(metadata, organization_id)
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
