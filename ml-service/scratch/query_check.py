import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from sqlalchemy import text
from config.db import get_engine
from feature_engineering.forecast_feature_builder import _read_project_rows

engine = get_engine()
df = _read_project_rows(completed_only=True, organization_id=1)
print("Completed projects for Org 1 count:", len(df))
if not df.empty:
    print(df.head())
else:
    print("DataFrame is empty!")
