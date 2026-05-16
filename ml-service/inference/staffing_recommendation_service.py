import json
from datetime import datetime, timezone
from typing import Any

from inference.predictors import build_prediction_frame, load_artifact
from utils.feature_utils import normalize_role
from utils.paths import REPORTS_DIR, ensure_runtime_dirs

THRESHOLD = 0.35


def _number(value: Any, default: float = 0.0) -> float:
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _role_name(target_column: str) -> str:
    return target_column.replace("target_staff_", "")


def _ensure(team: dict[str, int], role: str, count: int = 1) -> None:
    normalized = normalize_role(role)
    team[normalized] = max(int(team.get(normalized, 0)), int(count))


def _has_role(team: dict[str, int], fragment: str) -> bool:
    fragment = fragment.lower()
    return any(fragment in role.lower() and count > 0 for role, count in team.items())


def _matching_roles(available_roles: set[str], *fragments: str) -> list[str]:
    normalized_fragments = [normalize_role(fragment).lower() for fragment in fragments if fragment]
    return sorted(
        role
        for role in available_roles
        if all(fragment in role.lower() for fragment in normalized_fragments)
    )


def _ensure_first_available(team: dict[str, int], available_roles: set[str], count: int, *fragment_sets: tuple[str, ...]) -> None:
    for fragments in fragment_sets:
        matches = _matching_roles(available_roles, *fragments)
        if matches:
            _ensure(team, matches[0], count)
            return


def _project_context(payload: dict) -> str:
    basic = payload.get("basicInfo", payload)
    delivery = payload.get("deliveryDetails", {})
    technology = payload.get("technology", {})
    return " ".join(
        str(value or "")
        for value in [
            basic.get("industry"),
            basic.get("project_type"),
            basic.get("delivery_model"),
            delivery.get("release_frequency"),
            technology.get("technology_stack"),
            technology.get("architecture_type"),
            technology.get("cloud_platform"),
            technology.get("external_dependencies"),
        ]
    ).lower()


def _duration_days(payload: dict) -> int:
    delivery = payload.get("deliveryDetails", {})
    start = delivery.get("start_date")
    end = delivery.get("planned_end_date")
    if not start or not end:
        return 0
    try:
        start_dt = datetime.fromisoformat(start)
        end_dt = datetime.fromisoformat(end)
        return max((end_dt - start_dt).days, 0)
    except ValueError:
        return 0


def _apply_heuristics(team: dict[str, int], payload: dict, available_roles: set[str]) -> dict[str, int]:
    context = _project_context(payload)
    technology = payload.get("technology", {})
    risks = payload.get("risks", {})
    delivery = payload.get("deliveryDetails", {})
    duration = _duration_days(payload)
    integration_count = _number(technology.get("integration_count"), 0)
    complexity = _number(technology.get("complexity"), 0)

    if not _has_role(team, "Project_Manager") and not _has_role(team, "Scrum_Master"):
        _ensure_first_available(team, available_roles, 1, ("Project", "Manager"), ("Program", "Manager"))
    if "agile" in context:
        _ensure_first_available(team, available_roles, 1, ("Scrum", "Master"), ("Project", "Manager"))

    stack = str(technology.get("technology_stack") or "").strip()
    if stack:
        stack_count = 2 if duration < 120 else 4
        _ensure_first_available(
            team,
            available_roles,
            stack_count,
            (stack, "SSE"),
            (stack, "Developer"),
            (stack, "Engineer"),
            (stack, "Lead"),
            (stack,),
        )

    if any(token in context for token in ["aws", "azure", "gcp", "cloud"]):
        _ensure_first_available(team, available_roles, 1, ("Cloud", "Engineer"), ("DevOps", "Engineer"), ("SRE", "Engineer"))
    if duration >= 60 or complexity >= 3:
        _ensure_first_available(team, available_roles, 1, ("QA", "Lead"), ("Manual", "Tester"), ("Automation", "Tester"))
    if "api" in context or "modernization" in context or _number(risks.get("expected_cr_volatility"), 0) > 0:
        _ensure_first_available(team, available_roles, 1, ("Automation", "Tester"), ("QA", "Lead"))
    if integration_count >= 3 or complexity >= 4 or any(token in context for token in ["microservice", "integration"]):
        _ensure_first_available(team, available_roles, 1, ("Solution", "Architect"), ("Technical", "Architect"), ("Enterprise", "Architect"))
    if not _has_role(team, "Business_Analyst") and duration >= 30:
        _ensure_first_available(team, available_roles, 1, ("Business", "Analyst"), ("Functional", "Consultant"))
    if delivery.get("milestone_count") and _number(delivery.get("milestone_count"), 0) >= 3:
        _ensure_first_available(team, available_roles, 1, ("Project", "Manager"), ("Delivery", "Manager"))

    return {role: count for role, count in team.items() if count > 0 and role in available_roles}


def _log_debug(payload: dict, raw: dict[str, float], post_processed: dict[str, int], final: dict[str, int]) -> None:
    ensure_runtime_dirs()
    debug_path = REPORTS_DIR / "staffing_prediction_debug.jsonl"
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "projectContext": {
            "industry": payload.get("basicInfo", {}).get("industry") or payload.get("industry"),
            "technology": payload.get("technology", {}).get("technology_stack") or payload.get("technology_stack"),
            "deliveryModel": payload.get("basicInfo", {}).get("delivery_model") or payload.get("delivery_model"),
        },
        "rawPredictions": raw,
        "postProcessedPredictions": post_processed,
        "finalRecommendation": final,
    }
    with debug_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")


def build_staffing_recommendation(payload: dict) -> dict:
    artifact = load_artifact("staffing_model.joblib")
    frame = build_prediction_frame(payload, artifact["feature_columns"])
    prediction = artifact["pipeline"].predict(frame)[0]
    target_columns = artifact["target_columns"]

    raw = {
        _role_name(role): float(max(value, 0))
        for role, value in zip(target_columns, prediction)
    }
    available_roles = set(raw.keys())
    post_processed = {
        role: (max(1, round(value)) if value >= THRESHOLD else 0)
        for role, value in raw.items()
    }
    final = _apply_heuristics(dict(post_processed), payload, available_roles)
    _log_debug(payload, raw, post_processed, final)

    return {
        "recommendedTeam": final,
        "rawPredictions": raw,
        "postProcessedPredictions": post_processed,
    }
