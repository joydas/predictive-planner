import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from config.db import get_engine

engine = get_engine()
with engine.connect() as conn:
    res = conn.execute(text("SELECT * FROM project WHERE project_id = 395")).fetchone()
    if res:
        # print keys and values
        keys = conn.execute(text("SHOW COLUMNS FROM project")).fetchall()
        for idx, key in enumerate(keys):
            print(f"{key[0]}: {res[idx]}")
