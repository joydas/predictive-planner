import pandas as pd
from sklearn.linear_model import LinearRegression

def predict_final_effort(data):
    df = pd.DataFrame(data)

    # Convert date to number
    df['day'] = range(1, len(df) + 1)

    X = df[['day']]
    y = df['effort_spent']

    model = LinearRegression()
    model.fit(X, y)

    # Predict for future day (e.g., day 10)
    future_day = [[10]]
    predicted_effort = model.predict(future_day)

    return float(predicted_effort[0])