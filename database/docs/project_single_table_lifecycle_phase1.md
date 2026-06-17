# Project Single-Table Lifecycle - Phase 1

## Current Architecture

Project creation currently starts in `project_drafts`. PM draft saves write JSON into `project_drafts.draft_data`; submission and review update `project_drafts.workflow_status` and append `project_workflow_history`. On approval, `projectPublishing.service` copies the approved draft into `project`, marks the draft as published, and operational modules use the published `project.project_id`.

Important existing dependencies:

- Workflow history is stored in `project_workflow_history.project_id`.
- Old draft-backed projects use the draft ID for workflow history and `project.source_draft_id` to link the approved project to the draft.
- CRs, progress, forecasting, dashboards, and ML currently depend on approved `project` rows.

## Target Architecture

New projects are stored directly in `project` from the first save. The direct row uses:

- `project.source_draft_id IS NULL`
- `project.workflow_status` as the lifecycle state
- `project.approved_data` as the canonical JSON payload until a later schema refinement
- `project_workflow_history.project_id = project.project_id`

Supported lifecycle states for Phase 1:

- `DRAFT`
- `SUBMITTED`
- `APPROVED`
- `ACTIVE`
- `COMPLETED`
- `REJECTED`
- `RETURNED` remains supported for backward compatibility with the existing reviewer return flow.

## Phase 1 Migration Strategy

No historical records are migrated. Old and new records run side by side:

- Old records: `project_drafts -> approval -> project`
- New records: `project(DRAFT) -> SUBMITTED -> APPROVED`

The migration makes `project.source_draft_id` nullable and adds lifecycle/audit columns to `project`: `status`, `workflow_status`, `current_status_id`, `submitted_by_user_id`, `submitted_at`, and `latest_comment`. If `workflow_status_master` exists, the project lifecycle statuses are seeded there. If it does not exist, no duplicate status table is created.

## Backend Changes

- Draft save now creates a direct `project` row for new projects.
- Draft update first checks for a direct project row, then falls back to `project_drafts`.
- Submit detects whether the ID is a direct project or a historical draft.
- Approval of direct projects updates `project.workflow_status` and does not publish/copy into a second project row.
- Approval of historical drafts still uses the existing publish flow.
- Project list and detail queries include both old draft-backed projects and new direct projects.
- CR availability and CR list/update paths tolerate `project.source_draft_id IS NULL`.
- Forecast/similar-project access checks tolerate direct project rows without changing ML training logic.

## UI Changes

- Project list displays direct project lifecycle statuses from the unified project row.
- Status filters include `ACTIVE` and `COMPLETED`.
- Legacy `COMPLETE` is normalized to `COMPLETED` for display.
- Create/edit UI remains backward compatible because API responses still include `draftId`; new records also return `projectId`.

## Risks

- Some analytics and ML SQL still explicitly joins through `project_drafts` for historical training cohorts. Phase 1 intentionally avoids changing training semantics.
- `project_workflow_history.project_id` has mixed meaning during the transition: old rows point to draft IDs; new rows point to project IDs.
- Existing direct SQL consumers that assume `project.source_draft_id` is always non-null must be updated before Phase 2.

## Rollback Strategy

Application rollback:

1. Deploy the previous backend/frontend build.
2. New direct project rows remain in `project` with `source_draft_id IS NULL`; old code will not list them, but old draft-backed flows continue to work.

Database rollback, if required before any new direct projects are created:

1. Confirm no direct rows exist: `SELECT COUNT(*) FROM project WHERE source_draft_id IS NULL;`
2. Drop added columns only if the count is zero and no dependent release is active.
3. Change `source_draft_id` back to `NOT NULL` only after confirming all rows have a source draft.

If direct project rows already exist, do not force a schema rollback. Either keep the additive columns or convert those rows into `project_drafts` through a dedicated data migration.
