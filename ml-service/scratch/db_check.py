import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from config.db import get_engine

engine = get_engine()
with engine.connect() as conn:
    print("Project count by workflow_status:")
    res = conn.execute(text("SELECT workflow_status, COUNT(*) FROM project GROUP BY workflow_status"))
    for row in res.fetchall():
        print(row)

    print("\nProject counts with actual_completion_date:")
    res = conn.execute(text("SELECT COUNT(*) FROM project WHERE actual_completion_date IS NOT NULL"))
    print("actual_completion_date not null:", res.fetchone()[0])

    print("\nProject completion history rows:")
    res = conn.execute(text("SELECT COUNT(*) FROM project_completion_history"))
    print("completion history rows:", res.fetchone()[0])
