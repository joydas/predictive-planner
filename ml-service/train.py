import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
import joblib

# Load data
df = pd.read_csv("project_data.csv")

# Features (inputs)
X = df[['team_size', 'complexity', 'change_count', 'avg_experience', 'technology_score']]

# Target (output)
y = df['actual_hours']

# Train model
model = GradientBoostingRegressor()
model.fit(X, y)

# Save model
joblib.dump(model, "model.pkl")

print("Model trained and saved!")