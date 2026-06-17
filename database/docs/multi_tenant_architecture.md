# Multi-Tenant SaaS Foundation Architecture

## Overview
Predictive Planner is transitioning from a single-tenant application to a multi-tenant SaaS platform. The chosen architecture is **Shared Database, Shared Schema**, where each record in business-critical tables is isolated using an `organization_id`.

## Core Components

### 1. Organization Entity
The `organization` table serves as the root for all tenant-specific data.
* `organization_id`: Primary key.
* `organization_code`: Unique identifier (e.g., 'ACME', 'GLOBEX').
* `organization_name`: Human-readable name.

### 2. Tenant Isolation
Every business table will include an `organization_id` column.
* **Filtering**: All SQL queries MUST include `WHERE organization_id = ?`.
* **Insertion**: All NEW records MUST be stamped with the `organization_id` from the active user's context.

### 3. Identity & Access Management (IAM)
* **User Ownership**: Every `app_user` belongs to exactly one `organization`.
* **Security Context**: The `organization_id` is embedded in the JWT upon login.
* **Enforcement**: Middleware ensures the `req.user.organizationId` is present and valid for all authenticated requests.

## Data Isolation Strategy

### Isolated Tables
* `app_user`
* `project`
* `project_drafts`
* `change_request`
* `resource_master`
* `resource_allocation`
* `ml_prediction_log`
* `ml_prediction_feedback`
* ... (all project-related history and snapshots)

### Shared (Master) Data
Global master data remains shared but can be extended to be tenant-specific in future phases if needed:
* `md_role`
* `md_skill`
* `md_industry`
* `md_project_type`

## ML Isolation Design
ML training and inference will be isolated at the data retrieval layer.
* **Training**: Dataset builders will filter by `organization_id`.
* **Inference**: Prediction requests will only consider historical projects within the same organization for "Similar Project" and "Explainability" features.
* **Models**: Initially, a global model may be used, but training data will be partitioned by organization to support tenant-specific models in Phase 2.
