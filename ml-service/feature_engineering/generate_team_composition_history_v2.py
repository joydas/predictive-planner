from __future__ import annotations

import argparse
import csv
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import text

from config.db import get_engine

SCRIPT_DIR = Path(__file__).resolve().parent
DATASETS_DIR = SCRIPT_DIR.parent / "datasets"
OUTPUT_FILENAME = "team_composition_history_v2.csv"

STACK_ROLE_MAP = {
    "sap": ["SAP Consultant"],
    "react": ["React Developer", "Python Developer"],
    "java": ["Java Developer"],
    "python": ["Python Developer"],
    "nodejs": ["Python Developer"],
    ".net": ["Python Developer"],
    "php": ["Python Developer"],
}

ROLE_DAILY_RATE = {
    "PM": 1200,
    "Project Manager": 1200,
    "Program Manager": 1200,
    "Delivery Manager": 1200,
    "Scrum Master": 1100,
    "BA": 1000,
    "Business Analyst": 1000,
    "QA Lead": 900,
    "Manual Tester": 750,
    "Automation Tester": 800,
    "DevOps Engineer": 950,
    "DevOps": 900,
    "Solution Architect": 1300,
    "Architect": 1250,
    "Technical Architect": 1250,
    "SAP Consultant": 1100,
    "Java Developer": 1000,
    "Java Lead": 1100,
    "Java SSE": 1050,
    "Python Developer": 1000,
    "Python Lead": 1100,
    "Python SSE": 1050,
    "React Developer": 950,
    "React Lead": 1050,
    "React SSE": 1000,
}

DEFAULT_ROLE_RATE = 900
SNAPSHOT_DATE = date(2025, 12, 1)
DEFAULT_LOCATION = "Onsite"
OFFSHORE_LOCATION = "Offshore"


def normalize_stack(stack: Any) -> list[str]:
    if stack is None:
        return []
    raw = str(stack or "")
    parts = [part.strip() for part in raw.replace(";", ",").split(",") if part.strip()]
    return [part for part in parts if part]


def role_rate(role_name: str) -> int:
    return ROLE_DAILY_RATE.get(role_name, DEFAULT_ROLE_RATE)


def avg_experience_years(role_name: str) -> float:
    if role_name in {"PM", "Project Manager", "Program Manager", "Delivery Manager", "Scrum Master", "Solution Architect", "Architect", "Technical Architect", "SAP Consultant", "Java Lead", "Python Lead", "React Lead"}:
        return 9.0
    if role_name in {"BA", "Business Analyst", "DevOps Engineer", "DevOps", "Cloud Engineer", "SRE Engineer"}:
        return 7.0
    if role_name in {"QA Lead", "Manual Tester", "Automation Tester", "Performance Tester"}:
        return 6.0
    if role_name in {"Java Developer", "Python Developer", "React Developer", "Java SSE", "Python SSE", "React SSE", "SAP Consultant"}:
        return 5.5
    return 5.0


def build_project_rows(project: dict[str, Any], role_id_map: dict[str, int]) -> list[dict[str, Any]]:
    project_id = int(project.get("project_id"))
    team_size = int(project.get("team_size") or 10)
    team_size = max(team_size, 6)
    stack_tokens = [token.lower() for token in normalize_stack(project.get("technology_stack"))]
    delivery_model = str(project.get("delivery_model") or "").strip().lower()
    project_type = str(project.get("project_type") or "").strip().lower()

    roles: dict[str, int] = {
        "PM": 1,
        "BA": 1,
        "QA Lead": 1,
    }

    if team_size >= 7:
        roles["Manual Tester"] = 1
    if team_size >= 12:
        roles["Automation Tester"] = 1
    if team_size >= 14 and ("agile" in delivery_model or "new build" in project_type):
        roles["Scrum Master"] = 1
    if team_size >= 14:
        roles["DevOps Engineer"] = 1
    if team_size >= 18:
        roles["Solution Architect"] = 1

    tech_roles: dict[str, int] = {}
    for token in stack_tokens:
        if token in STACK_ROLE_MAP:
            for role_name in STACK_ROLE_MAP[token]:
                tech_roles[role_name] = tech_roles.get(role_name, 0) + max(1, round(team_size * 0.25))

    if not tech_roles:
        tech_roles["Python Developer"] = max(1, round(team_size * 0.35))

    if "react" in stack_tokens and team_size >= 18:
        tech_roles["React Lead"] = 1
    if "java" in stack_tokens and team_size >= 18:
        tech_roles["Java Lead"] = 1
    if "python" in stack_tokens and team_size >= 18:
        tech_roles["Python Lead"] = 1

    for name, count in tech_roles.items():
        roles[name] = roles.get(name, 0) + count

    if "sap" in stack_tokens and team_size >= 16:
        roles["SAP Consultant"] = max(2, roles.get("SAP Consultant", 0))
        roles["Solution Architect"] = max(1, roles.get("Solution Architect", 0))

    total_count = sum(roles.values())
    if total_count > team_size:
        for adjustable_role in ["Python Developer", "Java Developer", "React Developer", "SAP Consultant", "Automation Tester", "Manual Tester"]:
            while roles.get(adjustable_role, 0) > 1 and total_count > team_size:
                roles[adjustable_role] -= 1
                total_count -= 1
                if total_count <= team_size:
                    break

    if total_count < max(3, team_size // 2):
        priority = ["Python Developer", "Java Developer", "React Developer", "SAP Consultant"]
        while total_count < max(3, team_size // 2):
            for developer_role in priority:
                if developer_role in roles:
                    roles[developer_role] += 1
                    total_count += 1
                    if total_count >= max(3, team_size // 2):
                        break
            else:
                roles["Python Developer"] = roles.get("Python Developer", 0) + 1
                total_count += 1

    rows: list[dict[str, Any]] = []
    for role_name, count in sorted(roles.items(), key=lambda item: item[0]):
        if count <= 0:
            continue
        location_type = OFFSHORE_LOCATION if role_name in {"Python Developer", "Java Developer", "React Developer", "SAP Consultant", "Manual Tester", "Automation Tester", "DevOps Engineer"} and team_size >= 15 else DEFAULT_LOCATION
        location = location_type
        rows.append(
            {
                "project_id": project_id,
                "snapshot_date": SNAPSHOT_DATE.isoformat(),
                "role_id": role_id_map.get(role_name),
                "role": role_name,
                "location_type": location_type,
                "location": location,
                "resource_count": count,
                "allocated_fte": count,
                "avg_experience_years": round(avg_experience_years(role_name), 2),
                "allocation_percent": 100,
                "allocation_start_date": (SNAPSHOT_DATE - timedelta(days=30)).isoformat(),
                "allocation_end_date": (SNAPSHOT_DATE + timedelta(days=180)).isoformat(),
                "rate_per_day": role_rate(role_name),
                "planned_effort": count * 160,
                "planned_cost": round(count * 160 * role_rate(role_name), 2),
            }
        )

    return rows


def load_active_role_map(engine: Engine) -> dict[str, int]:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT role_id, role_name FROM md_role WHERE active_flag=1")).all()
    return {row._mapping["role_name"]: row._mapping["role_id"] for row in rows}


def load_projects(engine: Engine) -> list[dict[str, Any]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT project_id, industry, project_type, delivery_model, technology_stack, planned_effort, actual_effort_hours, team_size FROM project ORDER BY project_id"
            )
        ).all()
    return [row._mapping for row in rows]


def generate_team_composition_history(engine: Engine, output_path: Path | None = None) -> list[dict[str, Any]]:
    output_path = output_path or DATASETS_DIR / OUTPUT_FILENAME
    output_path.parent.mkdir(parents=True, exist_ok=True)

    role_id_map = load_active_role_map(engine)
    projects = load_projects(engine)
    rows: list[dict[str, Any]] = []
    for project in projects:
        rows.extend(build_project_rows(project, role_id_map))

    if rows:
        fieldnames = list(rows[0].keys())
        with open(output_path, "w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)

    return rows


def import_team_composition_history(engine: Engine, rows: list[dict[str, Any]], replace_existing: bool = False) -> int:
    if not rows:
        return 0

    if replace_existing:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM project_team_snapshot"))
            conn.execute(text("ALTER TABLE project_team_snapshot AUTO_INCREMENT = 1"))
            insert_sql = text(
                "INSERT INTO project_team_snapshot (project_id, snapshot_date, role_id, role, location_type, location, resource_count, allocated_fte, avg_experience_years, allocation_percent, allocation_start_date, allocation_end_date, rate_per_day, planned_effort, planned_cost) VALUES (:project_id, :snapshot_date, :role_id, :role, :location_type, :location, :resource_count, :allocated_fte, :avg_experience_years, :allocation_percent, :allocation_start_date, :allocation_end_date, :rate_per_day, :planned_effort, :planned_cost)"
            )
            conn.execute(insert_sql, rows)
        return len(rows)

    with engine.begin() as conn:
        insert_sql = text(
            "INSERT INTO project_team_snapshot (project_id, snapshot_date, role_id, role, location_type, location, resource_count, allocated_fte, avg_experience_years, allocation_percent, allocation_start_date, allocation_end_date, rate_per_day, planned_effort, planned_cost) VALUES (:project_id, :snapshot_date, :role_id, :role, :location_type, :location, :resource_count, :allocated_fte, :avg_experience_years, :allocation_percent, :allocation_start_date, :allocation_end_date, :rate_per_day, :planned_effort, :planned_cost)"
        )
        conn.execute(insert_sql, rows)
    return len(rows)


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    summary = {"project_count": 0, "total_rows": len(rows), "unique_projects": 0, "role_distribution": {}}
    project_ids = set()
    for row in rows:
        project_ids.add(row["project_id"])
        summary["role_distribution"][row["role"]] = summary["role_distribution"].get(row["role"], 0) + int(row["resource_count"])
    summary["project_count"] = len(project_ids)
    summary["unique_projects"] = len(project_ids)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate enriched team composition history and optionally import it into project_team_snapshot."
    )
    parser.add_argument("--output", type=Path, help="Output CSV path for generated team composition history.")
    parser.add_argument("--load-db", action="store_true", help="Load the generated team composition history into the project_team_snapshot table.")
    parser.add_argument("--replace-existing", action="store_true", help="Replace existing project_team_snapshot rows when loading.")
    args = parser.parse_args()

    engine = get_engine()
    rows = generate_team_composition_history(engine, output_path=args.output)
    summary = summarize_rows(rows)
    print(f"Generated {summary['total_rows']} snapshot rows for {summary['unique_projects']} projects.")
    if args.load_db:
        inserted = import_team_composition_history(engine, rows, replace_existing=args.replace_existing)
        print(f"Imported {inserted} snapshot rows into project_team_snapshot.")


if __name__ == "__main__":
    main()
