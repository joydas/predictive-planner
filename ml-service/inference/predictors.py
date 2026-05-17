from functools import lru_cache
import json
from datetime import datetime, timezone
from typing import Any

import joblib
import pandas as pd

from utils.feature_utils import model_feature_columns, normalize_role, severity_score
from utils.paths import DATASETS_DIR, MODELS_DIR, REPORTS_DIR, ensure_runtime_dirs


def _number(value: Any, default: float = 0.0) -> float:
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _unwrap_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {}
    for key in ("projectData", "draftData", "approved_data", "approvedData"):
        nested = payload.get(key)
        if isinstance(nested, dict):
            return nested
    return payload


def _section(payload: dict, name: str) -> dict:
    payload = _unwrap_payload(payload)
    value = payload.get(name, {})
    return value if isinstance(value, dict) else {}


def _first(*values: Any, default: Any = "") -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return default


def _list_from_payload(payload: dict, *paths: tuple[str, ...]) -> list:
    payload = _unwrap_payload(payload)
    for path in paths:
        current: Any = payload
        for part in path:
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(part)
        if isinstance(current, list):
            return current
    return []


def flatten_payload(payload: dict) -> dict:
    flattened = {}

    def visit(prefix: str, value: Any) -> None:
        if isinstance(value, dict):
            for key, nested in value.items():
                visit(f"{prefix}.{key}" if prefix else str(key), nested)
        elif isinstance(value, list):
            flattened[prefix] = f"<list:{len(value)}>"
            for index, nested in enumerate(value[:5]):
                visit(f"{prefix}[{index}]", nested)
        else:
            flattened[prefix] = value

    visit("", _unwrap_payload(payload))
    return flattened


def _safe_days(start: Any, end: Any, inclusive: bool = False) -> int:
    start_dt = pd.to_datetime(start, errors="coerce")
    end_dt = pd.to_datetime(end, errors="coerce")
    if pd.isna(start_dt) or pd.isna(end_dt) or end_dt < start_dt:
        return 0
    days = int((end_dt - start_dt).days)
    return days + 1 if inclusive else days


def _working_days(start: Any, end: Any) -> int:
    start_dt = pd.to_datetime(start, errors="coerce")
    end_dt = pd.to_datetime(end, errors="coerce")
    if pd.isna(start_dt) or pd.isna(end_dt) or end_dt < start_dt:
        return 0
    return int(len(pd.bdate_range(start_dt.normalize(), end_dt.normalize())))


def _technology_count(value: Any) -> int:
    return len([part for part in str(value or "").replace(";", ",").split(",") if part.strip()])


def _derive_resource_planning(payload: dict, rows: list[dict]) -> dict:
    financial = _section(payload, "financial")
    delivery = _section(payload, "deliveryDetails")
    project_start = delivery.get("start_date")
    project_end = delivery.get("planned_end_date")
    planned_effort = 0.0
    budget = 0.0
    estimated_team_size = 0.0

    for row in rows or []:
        count = _number(_first(row.get("count"), row.get("resource_count"), default=0), 0)
        allocation = _number(_first(row.get("allocationPercent"), row.get("allocation"), row.get("allocation_percent"), default=100), 100)
        start = _first(row.get("startDate"), row.get("allocationStartDate"), row.get("allocation_start_date"), project_start)
        end = _first(row.get("endDate"), row.get("allocationEndDate"), row.get("allocation_end_date"), project_end)
        rate = _number(_first(row.get("ratePerDay"), row.get("rate_per_day"), row.get("rate"), default=0), 0)
        row_effort = _number(_first(row.get("plannedEffort"), row.get("planned_effort"), default=None), None)
        if row_effort is None:
            row_effort = count * (allocation / 100) * _working_days(start, end)
        planned_effort += row_effort
        budget += row_effort * rate
        estimated_team_size += count

    reserve = _number(financial.get("management_reserve_percent"), 0) + _number(financial.get("contingency_reserve_percent"), 0)
    return {
        "planned_effort": planned_effort,
        "budget": budget * (1 + reserve / 100),
        "estimated_team_size": estimated_team_size,
    }


def _team_stats(rows: list[dict]) -> dict:
    total = 0.0
    experience_values = []
    offshore = 0.0
    role_counts = {}
    for row in rows or []:
        count = _number(_first(row.get("count"), row.get("resource_count"), default=0), 0)
        role = normalize_role(_first(row.get("role"), row.get("roleName"), row.get("role_name"), default=""))
        experience = _number(_first(row.get("avgExperience"), row.get("avg_experience_years"), row.get("averageExperience"), default=0), 0)
        location_text = f"{row.get('locationType') or row.get('location_type') or ''} {row.get('location') or ''}"
        total += count
        experience_values.append(experience)
        if "OFFSHORE" in location_text.upper():
            offshore += count
        role_counts[role] = role_counts.get(role, 0) + count

    def role_sum(*tokens: str) -> float:
        total_count = 0.0
        for role, count in role_counts.items():
            role_upper = role.upper()
            if any(token in role_upper for token in tokens):
                total_count += count
        return total_count

    return {
        "total_team_size": total,
        "avg_team_experience": sum(experience_values) / len(experience_values) if experience_values else 0,
        "offshore_ratio": offshore / total if total else 0,
        "PM_count": role_sum("PM", "PROJECT_MANAGER", "PROGRAM_MANAGER"),
        "QA_count": role_sum("QA", "TESTER"),
        "Dev_count": role_sum("DEVELOPER", "_DEV", "ENGINEER", "SSE"),
    }


def _cr_features(payload: dict) -> dict:
    rows = _list_from_payload(
        payload,
        ("changeRequests",),
        ("changeRequests", "rows"),
        ("crs",),
        ("crs", "rows"),
        ("change_request",),
    )
    if not rows:
        return {
            "CR_count": _number(_first(payload.get("CR_count"), payload.get("cr_count"), default=0), 0),
            "total_schedule_impact": _number(payload.get("total_schedule_impact"), 0),
            "avg_CR_effort": _number(payload.get("avg_CR_effort"), 0),
            "avg_CR_severity": _number(payload.get("avg_CR_severity"), 0),
            "total_effort_increase": _number(payload.get("total_effort_increase"), 0),
            "total_schedule_increase": _number(payload.get("total_schedule_increase"), 0),
            "defect_linked_CR_ratio": _number(payload.get("defect_linked_CR_ratio"), 0),
            "CR_frequency": _number(payload.get("CR_frequency"), 0),
            "CR_volatility_score": _number(payload.get("CR_volatility_score"), 0),
        }

    schedule_impacts = [_number(_first(row.get("schedule_impact_days"), row.get("scheduleImpactDays"), row.get("scheduleImpact"), default=0), 0) for row in rows]
    effort_impacts = [_number(_first(row.get("estimated_effort_hours"), row.get("estimatedEffortHours"), row.get("effortImpact"), default=0), 0) for row in rows]
    severity_values = [severity_score(_first(row.get("severity"), row.get("priority"), default="")) for row in rows]
    defect_flags = [
        int("defect" in f"{row.get('cr_category') or row.get('category') or ''} {row.get('root_cause') or row.get('rootCause') or ''}".lower()
            or "bug" in f"{row.get('cr_category') or row.get('category') or ''} {row.get('root_cause') or row.get('rootCause') or ''}".lower())
        for row in rows
    ]
    count = len(rows)
    total_schedule = sum(schedule_impacts)
    avg_severity = sum(severity_values) / count if count else 0
    return {
        "CR_count": count,
        "total_schedule_impact": total_schedule,
        "avg_CR_effort": sum(effort_impacts) / count if count else 0,
        "avg_CR_severity": avg_severity,
        "total_effort_increase": sum(effort_impacts),
        "total_schedule_increase": total_schedule,
        "defect_linked_CR_ratio": sum(defect_flags) / count if count else 0,
        "CR_frequency": count,
        "CR_volatility_score": count * 0.4 + avg_severity * 0.3 + total_schedule * 0.3,
    }


def _workflow_features(rows: list[dict], prefix: str = "") -> dict:
    base = {
        "return_frequency": 0,
        "rejection_frequency": 0,
        "resubmission_count": 0,
        "approval_cycle_count": 0,
        "workflow_cycle_duration": 0,
        "approval_turnaround_time": 0,
    }
    if not rows:
        return {f"{prefix}{key}": value for key, value in base.items()}

    timestamps = []
    submissions = []
    approvals = []
    for row in rows:
        action = str(_first(row.get("action_type"), row.get("actionType"), row.get("action"), default="")).upper()
        timestamp = pd.to_datetime(_first(row.get("created_at"), row.get("createdAt"), row.get("timestamp"), default=None), errors="coerce")
        if pd.notna(timestamp):
            timestamps.append(timestamp)
        if action == "RETURN":
            base["return_frequency"] += 1
        if action == "REJECT":
            base["rejection_frequency"] += 1
        if action in {"SUBMIT", "RESUBMIT"}:
            base["resubmission_count"] += 1
            if pd.notna(timestamp):
                submissions.append(timestamp)
        if action == "APPROVE":
            base["approval_cycle_count"] += 1
            if pd.notna(timestamp):
                approvals.append(timestamp)
    if timestamps:
        base["workflow_cycle_duration"] = (max(timestamps) - min(timestamps)).total_seconds() / 3600
    if approvals and submissions:
        base["approval_turnaround_time"] = max((min(approvals) - min(submissions)).total_seconds() / 3600, 0)
    return {f"{prefix}{key}": value for key, value in base.items()}


def _build_prediction_row(payload: dict) -> dict:
    payload = _unwrap_payload(payload)
    basic = _section(payload, "basicInfo")
    delivery = _section(payload, "deliveryDetails")
    team = _section(payload, "teamComposition")
    technology = _section(payload, "technology")
    financial = _section(payload, "financial")
    risks = _section(payload, "risks")

    team_rows = team.get("rows", []) if isinstance(team, dict) else []
    team_features = _team_stats(team_rows)
    derived_planning = _derive_resource_planning(payload, team_rows)
    cr_features = _cr_features(payload)
    project_workflow = _workflow_features(
        _list_from_payload(payload, ("workflowHistory",), ("workflowHistory", "project"), ("projectWorkflowHistory",))
    )
    cr_workflow = _workflow_features(
        _list_from_payload(payload, ("crWorkflowHistory",), ("workflowHistory", "cr")),
        prefix="cr_",
    )
    tech_stack = _first(technology.get("technology_stack"), technology.get("stack"), payload.get("technology_stack"), payload.get("technology"), default="")

    start = pd.to_datetime(delivery.get("start_date"), errors="coerce")
    end = pd.to_datetime(delivery.get("planned_end_date"), errors="coerce")
    duration = max((end - start).days, 0) if pd.notna(start) and pd.notna(end) else _number(payload.get("project_duration"), 0)

    return {
        "industry": _first(basic.get("industry"), payload.get("industry"), default=""),
        "project_type": _first(basic.get("project_type"), payload.get("project_type"), default=""),
        "delivery_model": _first(basic.get("delivery_model"), payload.get("delivery_model"), default=""),
        "technology_stack": tech_stack,
        "complexity": _number(_first(technology.get("complexity"), payload.get("complexity"), default=1), 1),
        "estimated_team_size": _number(_first(financial.get("estimated_team_size"), payload.get("estimated_team_size"), derived_planning["estimated_team_size"], default=0), 0),
        "planned_effort": _number(_first(financial.get("planned_effort"), payload.get("planned_effort"), derived_planning["planned_effort"], default=0), 0),
        "budget": _number(_first(financial.get("budget"), payload.get("budget"), derived_planning["budget"], default=0), 0),
        "predicted_hours": _number(payload.get("predicted_hours"), 0),
        "project_duration": duration,
        "technology_count": _technology_count(tech_stack),
        "dependency_count": _number(_first(risks.get("dependency_count"), payload.get("dependency_count"), technology.get("integration_count"), default=0), 0),
        "requirement_stability_index": _number(
            _first(risks.get("requirement_stability_index"), payload.get("requirement_stability_index"), default=0), 0
        ),
        "criticality": _first(risks.get("criticality"), basic.get("business_criticality"), payload.get("criticality"), default=""),
        **cr_features,
        **project_workflow,
        **cr_workflow,
        **team_features,
    }


def build_prediction_frame(payload: dict, feature_columns: list[str]) -> pd.DataFrame:
    row = _build_prediction_row(payload)
    frame = pd.DataFrame([{column: row.get(column, 0) for column in feature_columns}])
    return frame


def feature_diagnostics(payload: dict, feature_columns: list[str], frame: pd.DataFrame | None = None) -> dict:
    computed_row = _build_prediction_row(payload)
    frame = frame if frame is not None else build_prediction_frame(payload, feature_columns)
    numeric_columns = [
        column for column in frame.columns
        if pd.api.types.is_numeric_dtype(frame[column])
    ]
    categorical_columns = [column for column in frame.columns if column not in numeric_columns]
    defaulted_features = [column for column in feature_columns if column not in computed_row]
    empty_categorical_fields = [
        column for column in categorical_columns if str(frame.iloc[0][column] or "").strip() == ""
    ]
    zero_numeric_fields = [
        column for column in numeric_columns if _number(frame.iloc[0][column], 0) == 0
    ]
    warnings = []
    if defaulted_features:
        warnings.append(f"{len(defaulted_features)} model features were defaulted because the mapper did not compute them")
    if empty_categorical_fields:
        warnings.append(f"{len(empty_categorical_fields)} categorical model features are blank")
    if numeric_columns and len(zero_numeric_fields) / len(numeric_columns) >= 0.7:
        warnings.append("numeric feature vector is mostly zero/default")

    return {
        "warnings": warnings,
        "defaultedFeatures": defaulted_features,
        "emptyCategoricalFields": empty_categorical_fields,
        "zeroNumericFields": zero_numeric_fields,
        "nonZeroNumericFields": [column for column in numeric_columns if column not in zero_numeric_fields],
    }


@lru_cache(maxsize=3)
def load_artifact(name: str) -> dict:
    path = MODELS_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Model artifact not found: {path}")
    return joblib.load(path)


def explain(payload: dict) -> list[str]:
    payload = _unwrap_payload(payload)
    explanations = []
    industry = payload.get("basicInfo", {}).get("industry") or payload.get("industry") or "similar"
    if _number(payload.get("CR_volatility_score"), 0) > 5:
        explanations.append(f"Recommended higher QA staffing because similar {industry} projects had high CR volatility.")
    if _number(payload.get("technology", {}).get("complexity", payload.get("complexity")), 0) >= 4:
        explanations.append("Higher complexity increased the baseline effort and delivery risk.")
    if _number(payload.get("risks", {}).get("requirement_stability_index", payload.get("requirement_stability_index")), 100) < 60:
        explanations.append("Lower requirement stability increased the schedule risk estimate.")
    return explanations or ["Recommendation is based on similar approved projects and their staffing, effort, and delivery outcomes."]


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _json_safe(nested) for key, nested in value.items()}
    if isinstance(value, list):
        return [_json_safe(nested) for nested in value]
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        return value.item()
    return value


def _log_inference_debug(model_name: str, payload: dict, artifact: dict, frame: pd.DataFrame, raw_prediction: Any, diagnostics: dict) -> None:
    ensure_runtime_dirs()
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model": model_name,
        "warnings": diagnostics.get("warnings", []),
        "flattenedPayload": flatten_payload(payload),
        "computedFeatures": {key: _json_safe(value) for key, value in _build_prediction_row(payload).items()},
        "inferenceFrame": {
            column: _json_safe(frame.iloc[0][column])
            for column in frame.columns
        },
        "featureColumns": artifact.get("feature_columns", []),
        "targetColumns": artifact.get("target_columns"),
        "defaultedFeatures": diagnostics.get("defaultedFeatures", []),
        "emptyCategoricalFields": diagnostics.get("emptyCategoricalFields", []),
        "zeroNumericFields": diagnostics.get("zeroNumericFields", []),
        "rawPrediction": _json_safe(raw_prediction),
    }
    debug_path = REPORTS_DIR / "inference_feature_debug.jsonl"
    with debug_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")


def _prediction_output(model_name: str, artifact: dict, frame: pd.DataFrame) -> Any:
    prediction = artifact["pipeline"].predict(frame)
    if model_name == "staffing":
        target_columns = artifact.get("target_columns", [])
        return {
            target.replace("target_staff_", ""): float(max(value, 0))
            for target, value in zip(target_columns, prediction[0])
        }
    if model_name == "risk":
        return int(prediction[0])
    return float(max(prediction[0], 0))


def _preprocessor_schema(artifact: dict) -> dict:
    preprocessor = artifact["pipeline"].named_steps.get("preprocessor")
    if not preprocessor:
        return {}
    schema = {}
    for name, _, columns in preprocessor.transformers_:
        if name == "remainder":
            continue
        schema[name] = list(columns)
    return schema


def _training_dataset_comparison(feature_columns: list[str]) -> dict:
    dataset_path = DATASETS_DIR / "project_training_dataset.csv"
    if not dataset_path.exists():
        return {"datasetPath": str(dataset_path), "available": False}

    df = pd.read_csv(dataset_path)
    current_training_features = model_feature_columns(df)
    missing_from_dataset = [column for column in feature_columns if column not in df.columns]
    extra_dataset_features = [column for column in current_training_features if column not in feature_columns]
    dtype_by_column = {
        column: str(df[column].dtype)
        for column in feature_columns
        if column in df.columns
    }
    numeric_summary = {}
    categorical_summary = {}
    for column in feature_columns:
        if column not in df.columns:
            continue
        series = df[column]
        if pd.api.types.is_numeric_dtype(series):
            numeric_summary[column] = {
                "min": _json_safe(series.min()),
                "max": _json_safe(series.max()),
                "mean": _json_safe(series.mean()),
                "zeroCount": int((series == 0).sum()),
            }
        else:
            categorical_summary[column] = {
                "uniqueCount": int(series.nunique(dropna=True)),
                "topValues": {
                    str(key): int(value)
                    for key, value in series.value_counts(dropna=False).head(5).items()
                },
            }

    return {
        "datasetPath": str(dataset_path),
        "available": True,
        "rowCount": int(len(df)),
        "currentTrainingFeatureCount": len(current_training_features),
        "missingModelFeaturesFromDataset": missing_from_dataset,
        "extraDatasetFeaturesNotInModel": extra_dataset_features,
        "dtypeByColumn": dtype_by_column,
        "numericSummary": numeric_summary,
        "categoricalSummary": categorical_summary,
    }


def _team_debug(payload: dict) -> dict:
    payload = _unwrap_payload(payload)
    team = payload.get("teamComposition", {})
    rows = team.get("rows", []) if isinstance(team, dict) else []
    normalized_rows = []
    for row in rows or []:
        normalized_rows.append(
            {
                "inputRole": row.get("role"),
                "normalizedRole": normalize_role(row.get("role")),
                "count": _number(row.get("count"), 0),
                "avgExperience": _number(row.get("avgExperience"), 0),
                "location": row.get("location"),
            }
        )
    return {
        "rows": normalized_rows,
        "aggregateFeatures": _team_stats(rows),
    }


def debug_model_prediction(model_name: str, payload: dict) -> dict:
    artifact_names = {
        "effort": "effort_model.joblib",
        "staffing": "staffing_model.joblib",
        "risk": "schedule_risk_model.joblib",
    }
    if model_name not in artifact_names:
        raise ValueError(f"Unsupported model debug target: {model_name}")

    artifact = load_artifact(artifact_names[model_name])
    feature_columns = artifact["feature_columns"]
    computed_row = _build_prediction_row(payload)
    frame = build_prediction_frame(payload, feature_columns)
    diagnostics = feature_diagnostics(payload, feature_columns, frame)
    defaulted_features = [
        column
        for column in feature_columns
        if column not in computed_row
    ]
    unused_computed_fields = [
        column
        for column in computed_row
        if column not in feature_columns
    ]

    debug = {
        "model": model_name,
        "artifact": artifact_names[model_name],
        "featureColumnCount": len(feature_columns),
        "featureColumns": feature_columns,
        "targetColumns": artifact.get("target_columns"),
        "excludedTargetColumns": artifact.get("excluded_target_columns"),
        "minNonZeroTargets": artifact.get("min_non_zero_targets"),
        "preprocessorSchema": _preprocessor_schema(artifact),
        "flattenedPayload": flatten_payload(payload),
        "diagnostics": diagnostics,
        "defaultedFeatures": defaulted_features,
        "unusedComputedFields": unused_computed_fields,
        "computedRow": {key: _json_safe(value) for key, value in computed_row.items()},
        "inferenceFrame": {
            column: _json_safe(frame.iloc[0][column])
            for column in frame.columns
        },
        "inferenceDtypes": {
            column: str(dtype)
            for column, dtype in frame.dtypes.items()
        },
        "trainingDatasetComparison": _training_dataset_comparison(feature_columns),
        "rawPrediction": _prediction_output(model_name, artifact, frame),
    }
    if model_name == "staffing":
        debug["teamDebug"] = _team_debug(payload)
    return debug


def predict_effort(payload: dict) -> dict:
    artifact = load_artifact("effort_model.joblib")
    frame = build_prediction_frame(payload, artifact["feature_columns"])
    prediction = artifact["pipeline"].predict(frame)[0]
    raw_prediction = float(max(prediction, 0))
    diagnostics = feature_diagnostics(payload, artifact["feature_columns"], frame)
    _log_inference_debug("effort", payload, artifact, frame, raw_prediction, diagnostics)
    response = {"predictedHours": raw_prediction, "explanation": explain(payload)}
    if diagnostics["warnings"]:
        response["diagnostics"] = diagnostics
    return response


def predict_staffing(payload: dict) -> dict:
    from inference.staffing_recommendation_service import build_staffing_recommendation

    recommendation = build_staffing_recommendation(payload)
    return {**recommendation, "explanation": explain(payload)}


def predict_risk(payload: dict) -> dict:
    artifact = load_artifact("schedule_risk_model.joblib")
    frame = build_prediction_frame(payload, artifact["feature_columns"])
    pipeline = artifact["pipeline"]
    delayed = int(pipeline.predict(frame)[0])
    diagnostics = feature_diagnostics(payload, artifact["feature_columns"], frame)
    _log_inference_debug("risk", payload, artifact, frame, delayed, diagnostics)
    probability = None
    if hasattr(pipeline.named_steps["model"], "predict_proba"):
        classes = list(pipeline.named_steps["model"].classes_)
        probabilities = pipeline.predict_proba(frame)[0]
        probability = float(probabilities[classes.index(1)]) if 1 in classes else 0.0
    response = {
        "delayedFlag": delayed,
        "riskLevel": "High" if delayed else "Low",
        "delayProbability": probability,
        "explanation": explain(payload),
    }
    if diagnostics["warnings"]:
        response["diagnostics"] = diagnostics
    return response
