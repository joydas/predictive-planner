from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
DATASETS_DIR = BASE_DIR / "datasets"
MODELS_DIR = BASE_DIR / "models"
REPORTS_DIR = BASE_DIR / "reports"


def get_tenant_datasets_dir(organization_id: int | str) -> Path:
    return DATASETS_DIR / str(organization_id)


def get_tenant_models_dir(organization_id: int | str) -> Path:
    return MODELS_DIR / str(organization_id)


def get_tenant_reports_dir(organization_id: int | str) -> Path:
    return REPORTS_DIR / str(organization_id)


def ensure_runtime_dirs(organization_id: int | str | None = None) -> None:
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    if organization_id is not None:
        get_tenant_datasets_dir(organization_id).mkdir(parents=True, exist_ok=True)
        get_tenant_models_dir(organization_id).mkdir(parents=True, exist_ok=True)
        get_tenant_reports_dir(organization_id).mkdir(parents=True, exist_ok=True)
