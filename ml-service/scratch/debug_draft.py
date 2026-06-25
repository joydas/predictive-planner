import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from config.db import get_engine

engine = get_engine()
with engine.connect() as conn:
    res = conn.execute(text("""
        SELECT p.project_id, p.approved_data, pd.draft_data 
        FROM project p 
        LEFT JOIN project_drafts pd ON pd.draft_id = p.source_draft_id 
        WHERE p.project_id = 395
    """)).fetchone()
    if res:
        print("Project ID:", res[0])
        print("Approved Data exists:", res[1] is not None)
        print("Draft Data exists:", res[2] is not None)
        if res[2]:
            import json
            parsed = json.loads(res[2])
            print("Draft Data JSON:")
            print(json.dumps(parsed, indent=2))
