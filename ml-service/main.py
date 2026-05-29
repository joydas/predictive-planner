import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from inference.predictors import debug_model_prediction, predict_effort, predict_risk, predict_staffing
from model_admin import current_info, get_job_logs, read_state, start_retraining
from timeseries import predict_final_effort


app = FastAPI(title="Predictive Planner ML Service")

DEFAULT_CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]


def parse_allowed_origins(raw_value: str):
    return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


allowed_origins = parse_allowed_origins(
    os.getenv("CORS_ALLOWED_ORIGINS", ",".join(DEFAULT_CORS_ALLOWED_ORIGINS))
)
allow_all_origins = "*" in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Predictive Planner ML service running"}


@app.post("/predict/effort")
def effort_prediction(data: dict):
    try:
        return predict_effort(data)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/predict/staffing")
def staffing_prediction(data: dict):
    try:
        return predict_staffing(data)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/predict/risk")
def risk_prediction(data: dict):
    try:
        return predict_risk(data)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/debug/predict/{model_name}")
def debug_prediction(model_name: str, data: dict):
    try:
        return debug_model_prediction(model_name, data)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/admin/ml/status")
def ml_admin_status():
    return current_info()


@app.post("/admin/ml/retrain")
def ml_admin_retrain():
    return start_retraining()


@app.get("/admin/ml/jobs/{job_id}")
def ml_admin_job(job_id: str):
    state = read_state()
    return {
        "jobId": job_id,
        "status": state.get("status"),
        "current": state if state.get("jobId") == job_id else None,
        "logs": get_job_logs(job_id),
    }


@app.post("/predict")
def legacy_predict(data: dict):
    result = predict_effort(data)
    return {
        "predicted_hours": result["predictedHours"],
        "explanation": result["explanation"],
    }


@app.post("/predict-delay")
def predict_delay(data: dict):
    result = predict_final_effort(data["progress"])
    return {"predicted_final_effort": result}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
