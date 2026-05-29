import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from utils.paths import MODELS_DIR, REPORTS_DIR, ensure_runtime_dirs


STATUS_IDLE = "IDLE"
STATUS_RUNNING = "RUNNING"
STATUS_SUCCESS = "SUCCESS"
STATUS_FAILED = "FAILED"

STATE_PATH = REPORTS_DIR / "ml_training_state.json"
HISTORY_PATH = REPORTS_DIR / "ml_training_history.json"
LOG_DIR = REPORTS_DIR / "training_jobs"
METADATA_PATH = MODELS_DIR / "model_metadata.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path, default):
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default
    return default


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_metadata() -> dict:
    return read_json(METADATA_PATH, {})


def read_history() -> list[dict]:
    history = read_json(HISTORY_PATH, [])
    return history if isinstance(history, list) else []


def read_state() -> dict:
    state = read_json(STATE_PATH, {"status": STATUS_IDLE})
    if state.get("status") == STATUS_RUNNING and state.get("pid"):
        return state
    return state if state.get("status") else {"status": STATUS_IDLE}


def append_history(entry: dict) -> None:
    history = read_history()
    history.insert(0, entry)
    write_json(HISTORY_PATH, history[:50])


def update_state(patch: dict) -> dict:
    state = {**read_state(), **patch}
    write_json(STATE_PATH, state)
    return state


def get_job_logs(job_id: str) -> list[str]:
    log_path = LOG_DIR / f"{job_id}.log"
    if not log_path.exists():
        return []
    return log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-200:]


def current_info() -> dict:
    ensure_runtime_dirs()
    metadata = read_metadata()
    state = read_state()
    running_job_id = state.get("jobId") if state.get("status") == STATUS_RUNNING else None
    return {
        "modelVersion": metadata.get("model_version") or metadata.get("training_timestamp") or "N/A",
        "lastTrainingAt": metadata.get("training_timestamp"),
        "trainingStatus": state.get("status", STATUS_IDLE),
        "runningJobId": running_job_id,
        "projectsUsed": metadata.get("project_count"),
        "recordsUsed": metadata.get("row_count"),
        "logs": get_job_logs(running_job_id) if running_job_id else [],
        "history": read_history(),
    }


def start_retraining() -> dict:
    ensure_runtime_dirs()
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    state = read_state()
    if state.get("status") == STATUS_RUNNING:
        return {"accepted": False, "jobId": state.get("jobId"), "status": STATUS_RUNNING}

    job_id = uuid4().hex
    log_path = LOG_DIR / f"{job_id}.log"
    update_state(
        {
            "jobId": job_id,
            "status": STATUS_RUNNING,
            "startedAt": utc_now(),
            "endedAt": None,
            "recordsUsed": None,
            "modelVersion": None,
            "error": None,
            "logPath": str(log_path),
        }
    )

    worker_path = Path(__file__).resolve().parent / "training_worker.py"
    with log_path.open("a", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            [sys.executable, "-u", str(worker_path), job_id],
            cwd=str(Path(__file__).resolve().parent),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

    update_state({"pid": process.pid})
    return {"accepted": True, "jobId": job_id, "status": STATUS_RUNNING}
