# Repository Impact Analysis - Multi-Tenancy

## Summary
Every repository query that interacts with business-specific tables must be updated to include an `organization_id` filter. This ensures that data from one tenant is never leaked to another.

## Impacted Repositories

### 1. user.repository.js
* **Gap**: `findByEmail`, `listUsers`, `listActiveAccountManagers`, `findById` do not filter by `organization_id`.
* **Remediation**: 
    * `findByEmail`: Add `organization_id` to the returned columns so it can be embedded in the JWT.
    * `listUsers`: Add `WHERE organization_id = ?`.
    * `createUser`: Include `organization_id` in the `INSERT`.

### 2. project.repository.js
* **Gap**: Extensively used across the app. `getProjectById`, `findProjectsForPm`, `listApprovedProjectsForPm`, `getDraftProjectById` all missing tenant filters.
* **Remediation**:
    * All `SELECT` queries must include `AND organization_id = ?`.
    * All `INSERT`/`UPDATE` operations must ensure `organization_id` is passed and used.

### 3. cr.repository.js
* **Gap**: `getCrById`, `listCrsByProject`, `listCrQueueForAm` missing tenant isolation.
* **Remediation**: Join with the `project` table or use the `organization_id` column now added to the `change_request` table.

### 4. analytics.repository.js
* **Gap**: Summary queries (PmSummary, AmSummary) and Variance Dashboard queries aggregate across all records.
* **Remediation**: Add `organization_id = ?` to all `SUM`, `COUNT`, and `AVG` queries.

### 5. resource.repository.js
* **Gap**: `listResources`, `findAllocationsByProject` missing tenant isolation.
* **Remediation**: Filter by `organization_id` on `resource_master` and `resource_allocation`.

## Implementation Pattern
Repositories should accept `organizationId` as a parameter in their public methods:
```javascript
async function listProjects(organizationId) {
  const [rows] = await db.query(
    'SELECT * FROM project WHERE organization_id = ?',
    [organizationId]
  );
  return rows;
}
```
