# Data Rejuvenation Utility – Quick Reference

## TL;DR Execution

```bash
cd backend-node

# Test without creating data
node utils/dataRejuvenation.js --dry-run --verbose

# Generate data
node utils/dataRejuvenation.js --verbose
```

## What Gets Generated

| Item | Quantity |
|------|----------|
| Projects | ~200 across 6 tech stacks |
| Progress Snapshots | ~2,400 (monthly per project) |
| Change Requests | ~350 (0–5 per project) |
| Completion History | 200 |
| Forecast Records | ~100 |

## Tech Stack Distribution

```
Java      → 50 projects
React     → 50 projects
.NET      → 30 projects
Python    → 30 projects
Node.js   → 20 projects
SAP       → 20 projects
─────────────────────────
TOTAL    → ~200 projects
```

## Key Features

✅ **Realistic Budgets**
- Calculated from role rates × team size × duration
- Not random, not guessed

✅ **Realistic Timelines**
- 30% (3–6 months)
- 50% (6–9 months)
- 20% (9–12 months)

✅ **Realistic Outcomes**
- 40% On Time
- 40% Minor Delay (+15 days)
- 20% Major Delay (+45 days)

✅ **Realistic Team Structures**
- Tech-stack specific roles
- Varied team sizes
- Mix of onsite/offshore/hybrid

✅ **Data Safety**
- Only ADDS data, never deletes
- Transaction-safe (rollback on failure)
- Existing data untouched

## Files Created

```
backend-node/
├── utils/
│   └── dataRejuvenation.js          ← Main utility script
├── DATA_REJUVENATION_README.md      ← Detailed documentation
└── DATA_REJUVENATION_QUICK_REF.md   ← This file
```

## Typical Execution Flow

```
1. Run Dry Run
   node utils/dataRejuvenation.js --dry-run --verbose
   
2. Review output and summary
   
3. Execute Production Run
   node utils/dataRejuvenation.js --verbose
   
4. Verify in Database
   SELECT COUNT(*) FROM project WHERE workflow_status = 'APPROVED';
   
5. Test ML & Dashboards
   (Verify improved recommendations and forecasting)
   
6. Archive Utility
   (No longer needed after first run)
```

## Database Verification Queries

```sql
-- Verify projects created
SELECT COUNT(*) as total FROM project WHERE workflow_status = 'APPROVED';

-- By technology
SELECT technology_stack, COUNT(*) as count 
FROM project GROUP BY technology_stack;

-- Verify progress snapshots
SELECT COUNT(*) as snapshots FROM project_progress_snapshot;

-- Verify change requests
SELECT COUNT(*) as change_requests FROM change_request;

-- Sample project details
SELECT project_id, project_name, client_name, technology_stack, 
       planned_effort, budget, workflow_status
FROM project 
WHERE workflow_status = 'APPROVED'
LIMIT 5;
```

## Performance Notes

| Mode | Time | Data Persisted |
|------|------|-----------------|
| Dry Run | 5–10 sec | None |
| Production | 30–60 sec | ~200 projects + related data |

## If Something Goes Wrong

### Incomplete Execution
- Automatic rollback triggers
- Database returns to pre-execution state
- Check logs for error details

### Duplicate Data (Running Multiple Times)
```sql
-- Clean up if needed (carefully!)
-- DELETE FROM project WHERE is_regression_data = 0 AND workflow_status = 'APPROVED';
-- (Only delete if you're certain these are test projects)
```

## Organization Assignment

All data → `organization_id = 1`

To change, edit line in `dataRejuvenation.js`:
```javascript
const CONFIG = {
  organizationId: 1,  // ← Change this value
  // ...
};
```

## Next Actions

After successful generation:

1. ✅ Run ML training pipeline
2. ✅ Test similar project recommendations
3. ✅ Test forecasting accuracy
4. ✅ Verify dashboard data realism
5. ✅ Archive this utility

---

**Status:** Ready for execution ✨

For detailed docs, see `DATA_REJUVENATION_README.md`
