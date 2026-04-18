import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import joblib
import numpy as np
from timeseries import predict_final_effort
import uvicorn

app = FastAPI()

DEFAULT_CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
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

model = joblib.load("model.pkl")

@app.get("/")
def home():
    return {"message": "ML Service Running 🚀"}

@app.post("/predict")
def predict(data: dict):
    features = np.array([[
        data["team_size"],
        data["complexity"],
        data["change_count"],
        data["avg_experience"],
        data["technology_score"]
    ]])

    prediction = model.predict(features)
    explanation = []

    if data["change_count"] > 10:
        explanation.append("High scope creep")

    if data["complexity"] > 3:
        explanation.append("High complexity")

    if data["avg_experience"] < 3:
        explanation.append("Low team experience")

    return {
        "predicted_hours": float(prediction[0]),
        "explanation": explanation
    }

@app.post("/predict-delay")
def predict_delay(data: dict):
    result = predict_final_effort(data["progress"])
    return {"predicted_final_effort": result}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
