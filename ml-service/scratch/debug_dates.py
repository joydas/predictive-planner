import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
from feature_engineering.forecast_feature_builder import _read_project_rows

projects = _read_project_rows(completed_only=True, organization_id=1)
for i, row in projects.head(10).iterrows():
    print(f"Project ID: {row['project_id']}, Planned completion: {repr(row['planned_completion_date'])}, Actual completion: {repr(row['actual_completion_date'])}")
