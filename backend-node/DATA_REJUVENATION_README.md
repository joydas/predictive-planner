# Data Rejuvenation Utility – Execution Guide

## Overview
This utility generates ~200 realistic projects with complete execution history for the Predictive Planner database. It is a **one-time manual utility** designed to improve ML training, recommendations, and forecasting quality.

## Location
```
backend-node/utils/dataRejuvenation.js
```

## Prerequisites
- Node.js v14+ installed
- Database connection configured (uses existing `DB_CONFIG`)
- Database tables exist:
  - `project`
  - `project_progress_snapshot`
  - `change_request`
  - `project_completion_history`
  - `project_forecast_snapshot`
  - `md_role`
  - `md_rate_card`
  - `md_industry`

## Execution

### 1. Dry Run (Recommended First Step)
Test the utility without persisting any data:
```bash
cd backend-node
node utils/dataRejuvenation.js --dry-run --verbose
```

**Output:** 
- Reports what would be generated
- Validates data generation logic
- Checks master data availability
- No database modifications

### 2. Production Run
Execute the utility to generate and persist data:
```bash
cd backend-node
node utils/dataRejuvenation.js --verbose
```

**Output:**
- Generates 200 projects
- Persists data to database
- Prints summary report
- Transaction-safe (rollback on failure)

### 3. Silent Execution
Run without verbose logging:
```bash
cd backend-node
node utils/dataRejuvenation.js
```

## Execution Options

| Flag | Purpose |
|------|---------|
| `--dry-run` | Simulate generation without persisting |
| `--verbose` | Print detailed logs during execution |

**Example with both flags:**
```bash
node utils/dataRejuvenation.js --dry-run --verbose
```

## Generated Data Structure

### Projects (~200 total)
- **Java:** 50 projects
- **React:** 50 projects
- **.NET:** 30 projects
- **Python:** 30 projects
- **Node.js:** 20 projects
- **SAP:** 20 projects

### Per-Project Data
| Type | Count | Details |
|------|-------|---------|
| Progress Snapshots | Monthly | Realistic non-linear progress |
| Change Requests | 0–5 | With effort/budget/team impact |
| Completion History | 1 | Final resource loading & costs |
| Forecast Snapshots | ~50% | Limited realistic forecasts |

### Naming Convention
- **Projects:** `Apex_001`, `Nova_002`, `Aurora_003`, etc.
- **Clients:** Acme Corp, Global Retail, NextGen Bank, etc.

## Data Quality Characteristics

### Realistic Durations
- 30% projects: 3–6 months
- 50% projects: 6–9 months
- 20% projects: 9–12 months

### Completion Outcomes
- 40% On Time
- 40% Minor Delay (~15 days)
- 20% Major Delay (~45 days)

### Team Composition
Generated based on tech stack:

**Java Teams:**
- Java Developer (3–8)
- Java Lead (1)
- QA Lead (1)
- Manual Tester (1–3)
- Project Manager (1)

**React Teams:**
- React Developer (3–8)
- React Lead (1)
- QA Lead (1)
- Automation Tester (1–3)
- Project Manager (1)

Similar realistic compositions for other tech stacks.

### Budget Calculation
Derived from:
- Role-based rates (from `md_rate_card`)
- Team size per role
- Project duration (days)
- Formula: `Cost = Σ(role_count × daily_rate × duration_in_months)`

## Data Preservation

The utility **ONLY ADDS** data. Existing records are never deleted or modified:
- ✅ Existing approved projects remain untouched
- ✅ Existing real projects remain untouched
- ✅ Existing ML feedback preserved
- ✅ Existing snapshots, forecasts, workflow history preserved
- ✅ New projects marked with `workflow_status = 'APPROVED'`

## Organization Assignment

All generated data is assigned to:
```
organization_id = 1
```

Update the `CONFIG` object in the utility if your default tenant differs.

## Sample Execution Output

```
🚀 Predictive Planner – Data Rejuvenation Utility
📊 Configuration: Organization ID = 1, Dry Run = false
---
✓ Fetching master data...
✓ Found 25 roles, 120 rate cards
✓ [JAVA] Generating project 1/50...
✓ [JAVA] Generating project 2/50...
... (progress logs)
✓ [SAP] Generating project 20/20...

✅ Data Generation Summary:
   Projects Created:          200
   By Technology:
      JAVA: 50
      REACT: 50
      DOTNET: 30
      PYTHON: 30
      NODEJS: 20
      SAP: 20
   Progress Snapshots:        2,400
   Change Requests:           350
   Completion Records:        200
   Forecast Records:          100

✨ Data Rejuvenation Successful!
```

## Execution Time
- Dry Run: ~5–10 seconds
- Production Run: ~30–60 seconds (depending on database performance)

## Rollback (If Needed)

If execution fails mid-way:
- **Automatic:** Transaction is rolled back automatically
- **Manual:** Delete records with `is_regression_data = 1` (future enhancement)

## Troubleshooting

### Error: "Cannot find module '../src/config/db.config'"
**Solution:** Ensure you're running from the `backend-node` directory:
```bash
cd backend-node
node utils/dataRejuvenation.js
```

### Error: "Connect ECONNREFUSED 127.0.0.1:3306"
**Solution:** Ensure MySQL is running and `DB_CONFIG` is correctly configured in `src/config/db.config.js`

### Error: "Table 'project' doesn't exist"
**Solution:** Run database migrations first or ensure all tables are created via repository initialization:
```bash
node -e "const repo = require('./src/repositories/project.repository'); repo.ensureApprovedProjectTables();"
```

### Master Data Not Found
**Solution:** Verify `md_role`, `md_rate_card`, `md_industry` tables are populated. Run:
```bash
node -e "const repo = require('./src/repositories/masterData.repository'); repo.ensureIndustryMasterTable();"
```

## Post-Execution Verification

Query generated data:
```sql
-- Count generated projects
SELECT COUNT(*) FROM project WHERE workflow_status = 'APPROVED' AND is_regression_data = 0;

-- Count projects by tech stack
SELECT technology_stack, COUNT(*) FROM project GROUP BY technology_stack;

-- Count progress snapshots
SELECT COUNT(*) FROM project_progress_snapshot;

-- Count change requests
SELECT COUNT(*) FROM change_request;

-- Count completion records
SELECT COUNT(*) FROM project_completion_history;
```

## Next Steps After Generation

1. **Verify Data:** Run queries above to confirm generation
2. **Test ML:** Run ML training to validate improved model quality
3. **Test Recommendations:** Verify "similar projects" feature works better
4. **Check Dashboards:** Confirm dashboards display realistic data
5. **Archive Utility:** This script can be archived after successful execution

## Notes

- ⚠️ **One-time execution:** This utility is designed to run once. Running multiple times will generate duplicate data.
- ✅ **Transaction-safe:** All changes are wrapped in a single transaction
- ✅ **Minimal footprint:** ~500 lines of code, no framework abstractions
- ✅ **Reusable:** Uses existing services and repositories
- ⚠️ **Do NOT expose:** This utility should never be added to REST API or UI

## Support

For issues, check:
1. Database connectivity
2. Master data availability
3. Table schema compliance
4. Organization ID configuration
