from functools import lru_cache
from typing import Any

import joblib
import pandas as pd

from utils.feature_utils import normalize_role
from utils.paths import MODELS_DIR


def _number(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _team_stats(rows: list[dict]) -> dict:
    total = 0.0
    weighted_experience = 0.0
    offshore = 0.0
    role_counts = {}
    for row in rows or []:
        count = _number(row.get("count"), 0)
        role = normalize_role(row.get("role"))
        total += count
        weighted_experience += count * _number(row.get("avgExperience"), 0)
        if "OFFSHORE" in str(row.get("location") or "").upper():
            offshore += count
        role_counts[role] = role_counts.get(role, 0) + count
    return {
        "total_team_size": total,
        "avg_team_experience": weighted_experience / total if total else 0,
        "offshore_ratio": offshore / total if total else 0,
        "PM_count": role_counts.get("PM", 0),
        "QA_count": role_counts.get("QA", 0),
        "Dev_count": role_counts.get("Dev", 0) + role_counts.get("Developer", 0),
    }


def build_prediction_frame(payload: dict, feature_columns: list[str]) -> pd.DataFrame:
    basic = payload.get("basicInfo", payload)
    delivery = payload.get("deliveryDetails", {})
    team = payload.get("teamComposition", {})
    technology = payload.get("technology", {})
    financial = payload.get("financial", {})
    risks = payload.get("risks", {})

    team_rows = team.get("rows", []) if isinstance(team, dict) else []
    team_features = _team_stats(team_rows)
    tech_stack = technology.get("technology_stack") or payload.get("technology_stack") or ""

    start = pd.to_datetime(delivery.get("start_date"), errors="coerce")
    end = pd.to_datetime(delivery.get("planned_end_date"), errors="coerce")
    duration = max((end - start).days, 0) if pd.notna(start) and pd.notna(end) else _number(payload.get("project_duration"), 0)

    row = {
        "industry": basic.get("industry", payload.get("industry", "")),
        "project_type": basic.get("project_type", payload.get("project_type", "")),
        "delivery_model": basic.get("delivery_model", payload.get("delivery_model", "")),
        "technology_stack": tech_stack,
        "complexity": _number(technology.get("complexity", payload.get("complexity")), 1),
        "estimated_team_size": _number(financial.get("estimated_team_size", payload.get("estimated_team_size")), 0),
        "planned_effort": _number(financial.get("planned_effort", payload.get("planned_effort")), 0),
        "budget": _number(financial.get("budget", payload.get("budget")), 0),
        "predicted_hours": _number(payload.get("predicted_hours"), 0),
        "project_duration": duration,
        "technology_count": len([part for part in str(tech_stack).replace(";", ",").split(",") if part.strip()]),
        "dependency_count": _number(risks.get("dependency_count", payload.get("dependency_count")), 0),
        "requirement_stability_index": _number(
            risks.get("requirement_stability_index", payload.get("requirement_stability_index")), 0
        ),
        "criticality": risks.get("criticality", payload.get("criticality", "")),
        "CR_count": _number(payload.get("CR_count"), 0),
        "total_schedule_impact": _number(payload.get("total_schedule_impact"), 0),
        "avg_CR_effort": _number(payload.get("avg_CR_effort"), 0),
        "avg_CR_severity": _number(payload.get("avg_CR_severity"), 0),
        "total_effort_increase": _number(payload.get("total_effort_increase"), 0),
        "total_schedule_increase": _number(payload.get("total_schedule_increase"), 0),
        "defect_linked_CR_ratio": _number(payload.get("defect_linked_CR_ratio"), 0),
        "CR_frequency": _number(payload.get("CR_frequency"), 0),
        "CR_volatility_score": _number(payload.get("CR_volatility_score"), 0),
        "return_frequency": _number(payload.get("return_frequency"), 0),
        "rejection_frequency": _number(payload.get("rejection_frequency"), 0),
        "resubmission_count": _number(payload.get("resubmission_count"), 0),
        "approval_cycle_count": _number(payload.get("approval_cycle_count"), 0),
        "workflow_cycle_duration": _number(payload.get("workflow_cycle_duration"), 0),
        "approval_turnaround_time": _number(payload.get("approval_turnaround_time"), 0),
        **team_features,
    }

    frame = pd.DataFrame([{column: row.get(column, 0) for column in feature_columns}])
    return frame


@lru_cache(maxsize=3)
def load_artifact(name: str) -> dict:
    path = MODELS_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Model artifact not found: {path}")
    return joblib.load(path)


def explain(payload: dict) -> list[str]:
    explanations = []
    industry = payload.get("basicInfo", {}).get("industry") or payload.get("industry") or "similar"
    if _number(payload.get("CR_volatility_score"), 0) > 5:
        explanations.append(f"Recommended higher QA staffing because similar {industry} projects had high CR volatility.")
    if _number(payload.get("technology", {}).get("complexity", payload.get("complexity")), 0) >= 4:
        explanations.append("Higher complexity increased the baseline effort and delivery risk.")
    if _number(payload.get("risks", {}).get("requirement_stability_index", payload.get("requirement_stability_index")), 100) < 60:
        explanations.append("Lower requirement stability increased the schedule risk estimate.")
    return explanations or ["Recommendation is based on similar approved projects and their staffing, effort, and delivery outcomes."]


def predict_effort(payload: dict) -> dict:
    artifact = load_artifact("effort_model.joblib")
    frame = build_prediction_frame(payload, artifact["feature_columns"])
    prediction = artifact["pipeline"].predict(frame)[0]
    return {"predictedHours": float(max(prediction, 0)), "explanation": explain(payload)}


def predict_staffing(payload: dict) -> dict:
    from inference.staffing_recommendation_service import build_staffing_recommendation

    recommendation = build_staffing_recommendation(payload)
    return {**recommendation, "explanation": explain(payload)}


def predict_risk(payload: dict) -> dict:
    artifact = load_artifact("schedule_risk_model.joblib")
    frame = build_prediction_frame(payload, artifact["feature_columns"])
    pipeline = artifact["pipeline"]
    delayed = int(pipeline.predict(frame)[0])
    probability = None
    if hasattr(pipeline.named_steps["model"], "predict_proba"):
        classes = list(pipeline.named_steps["model"].classes_)
        probabilities = pipeline.predict_proba(frame)[0]
        probability = float(probabilities[classes.index(1)]) if 1 in classes else 0.0
    return {
        "delayedFlag": delayed,
        "riskLevel": "High" if delayed else "Low",
        "delayProbability": probability,
        "explanation": explain(payload),
    }
