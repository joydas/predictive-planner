import sys
import traceback

from model_admin import STATUS_FAILED, STATUS_SUCCESS, append_history, read_state, update_state, utc_now
from run_training_pipeline import run_training_pipeline


def log(message: str) -> None:
    print(message, flush=True)


def main(job_id: str) -> int:
    state = read_state()
    started_at = state.get("startedAt") or utc_now()
    try:
        metadata = run_training_pipeline(publish=True, job_id=job_id, log=log)
        ended_at = utc_now()
        entry = {
            "jobId": job_id,
            "modelVersion": metadata.get("model_version"),
            "startedAt": started_at,
            "endedAt": ended_at,
            "status": STATUS_SUCCESS,
            "recordsUsed": metadata.get("row_count"),
            "projectsUsed": metadata.get("project_count"),
        }
        append_history(entry)
        update_state({**entry, "error": None, "pid": None})
        return 0
    except Exception as exc:
        traceback.print_exc()
        ended_at = utc_now()
        entry = {
            "jobId": job_id,
            "modelVersion": None,
            "startedAt": started_at,
            "endedAt": ended_at,
            "status": STATUS_FAILED,
            "recordsUsed": None,
            "projectsUsed": None,
            "error": str(exc),
        }
        append_history(entry)
        update_state({**entry, "pid": None})
        return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("job_id is required")
    raise SystemExit(main(sys.argv[1]))
