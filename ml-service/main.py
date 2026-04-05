from fastapi import FastAPI
import joblib
import numpy as np
from timeseries import predict_final_effort

app = FastAPI()

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