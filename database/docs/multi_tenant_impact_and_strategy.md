# Multi-Tenant Foundation: Impact Analysis (API, Auth, ML)

## 1. API Impact Analysis
The API layer remains largely unchanged in structure, but the underlying data retrieval changes.
* **Headers**: No changes needed (JWT remains the bearer of truth).
* **Endpoints**: 
    * `/api/admin/users`: Now returns only users within the same organization.
    * `/api/projects`: Now returns only projects within the same organization.
    * `/api/analytics`: Aggregates only organization-specific data.
* **Context Propagation**: Controllers must extract `req.user.organizationId` and pass it down to services.

## 2. Authentication Impact Analysis
Authentication is the gateway for tenant context.
* **JWT Structure**: Add `organizationId` to the payload.
* **Auth Service**: Update `login` logic to fetch `organization_id` from `app_user`.
* **Middleware**: `authenticateToken` automatically propagates `organizationId` via `req.user`.

## 3. ML Impact Analysis
ML features must be isolated to maintain data privacy and relevance.
* **Training Data**: All `dataset_builder` scripts in `ml-service` must include `organization_id = ?` in their SQL queries.
* **Similar Projects**: The search space for "Similar Historical Projects" must be restricted to the current tenant.
* **Recommendations**: Staffing recommendations should only consider resources (`resource_master`) belonging to the same organization.
* **Forecasting**: Explainability benchmarks (medians, averages) must be calculated on a per-organization basis to avoid skewing results with cross-tenant data.

---

# Migration & Rollback Strategy

## Data Migration Strategy
1. **Initialize**: Create the `organization` table and seed the `Default Organization` (ID 1).
2. **Backfill**: Execute the migration script to add `organization_id` to all 15+ business tables.
3. **Assign**: Default all existing records (Users, Projects, CRs, etc.) to the `Default Organization`.
4. **Validation**: Verify that counts before and after the migration match for each table.

## Deployment Sequence
1. **Step 1**: Run Database Migrations.
2. **Step 2**: Deploy Backend changes (updated Repositories and Auth Context).
3. **Step 3**: Deploy ML Service updates (isolated dataset builders).

## Rollback Strategy
1. **Backend Rollback**: Revert to the previous version of the backend-node service.
2. **Database Rollback**:
    * Remove Foreign Key constraints.
    * Drop `organization_id` columns from all business tables.
    * Drop the `organization` table.
3. **Data Integrity**: Since all data was initially assigned to `organization_id = 1`, no data loss occurs upon dropping the column (as long as only one tenant exists during the rollback window).
