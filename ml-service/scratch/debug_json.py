import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from config.db import get_engine

engine = get_engine()
with engine.connect() as conn:
    res = conn.execute(text("SELECT approved_data FROM project WHERE project_id = 395")).fetchone()
    if res and res[0]:
        print("Project 395 Approved Data JSON:")
        import json
        try:
            parsed = json.loads(res[0])
            print(json.dumps(parsed, indent=2))
        except Exception as e:
            print(res[0])
    else:
        print("No approved_data for Project 395!")
