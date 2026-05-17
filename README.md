# Predictive Planner

## AI-Driven Predictive Project Planning & Governance Platform

Predictive Planner is an enterprise-grade project planning and governance platform that combines:

* AI-driven staffing recommendations
* predictive effort estimation
* workflow-driven approvals
* resource loading & budget planning
* change request governance
* operational dashboards
* variance analytics

to improve delivery planning accuracy, governance visibility, and operational decision-making.

The platform transforms historical delivery intelligence into actionable project recommendations using machine learning, analytics, and workflow orchestration.

---

# Key Capabilities

## AI-Assisted Project Planning

The platform uses historical delivery data to recommend:

* staffing composition
* estimated effort
* estimated budget
* team size
* delivery risk indicators

---

## Resource Loading & Budget Planning

Project Managers can:

* allocate resources by role
* configure onsite/offshore staffing
* define allocation percentages
* specify custom resource durations
* dynamically derive:

  * planned effort
  * planned budget
  * team size

---

## Workflow-Based Governance

Supports approval workflows for:

* project approvals
* project resubmissions
* change requests (CRs)

Roles supported:

* Project Manager (PM)
* Account Manager (AM)

---

## Immutable Baseline Architecture

The platform preserves:

* AI baseline recommendations
* PM baseline plans
* CR-adjusted current plans
* actual delivery outcomes

This enables:

* variance analytics
* governance intelligence
* AI effectiveness measurement
* delivery maturity analysis

---

## Change Request Governance

Approved CRs:

* incrementally impact current planning
* preserve original baselines
* maintain cumulative impact visibility

This creates measurable scope-growth analytics.

---

## Analytics Dashboard

Provides:

* effort variance analytics
* budget variance analytics
* staffing variance analytics
* AI vs Actual comparison
* governance visibility
* delivery drift analysis

---

## Operational Dashboard

Provides:

* active project visibility
* pending approvals
* workflow queues
* CR operational summaries
* operational KPIs

with role-based visibility.

---

# High-Level Architecture

```text
React Frontend
       ↓
Node.js / Express Backend APIs
       ↓
MariaDB + Python ML Engine
       ↓
Analytics & Governance Layer
```

---

# Technology Stack

| Layer          | Technology                      |
| -------------- | ------------------------------- |
| Frontend       | React + CoreUI                  |
| Backend        | Node.js + Express               |
| Database       | MariaDB / MySQL                 |
| ML Engine      | Python + FastAPI + scikit-learn |
| Authentication | JWT                             |
| Deployment     | AWS / Azure Ready               |

---

# Core Modules

| Module                | Purpose                      |
| --------------------- | ---------------------------- |
| Project Planning      | project metadata & staffing  |
| AI Recommendation     | staffing & effort prediction |
| Resource Loading      | dynamic planning             |
| Workflow Engine       | approvals & governance       |
| Change Request Engine | CR lifecycle                 |
| Analytics Dashboard   | variance intelligence        |
| Operational Dashboard | execution visibility         |
| Completion Module     | actual delivery capture      |

---

# Main Workflows

## Project Lifecycle

1. PM creates project
2. AI recommendations generated
3. PM adjusts staffing/resource loading
4. AM reviews & approves
5. Approved CRs modify current planning
6. PM completes project with actuals
7. Analytics compare:

   * AI baseline
   * PM baseline
   * CR-adjusted plan
   * actual delivery outcome

---

## AI Recommendation Lifecycle

1. Project metadata submitted
2. Backend builds feature payload
3. ML engine performs inference
4. Staffing & effort recommendations generated
5. AI baselines stored
6. PM adjusts planning before approval

---

## Change Request Lifecycle

1. PM creates CR
2. AM reviews CR
3. Approved CRs:

   * increment current planning
   * preserve baselines
4. Analytics reflect cumulative impact

---

# Machine Learning Overview

The ML engine learns from:

* historical projects
* staffing snapshots
* CR history
* delivery outcomes

to generate:

* staffing recommendations
* effort predictions
* risk indicators

---

# ML Lifecycle

```text
Operational Tables
        ↓
Historical Extraction
        ↓
CSV Preparation
        ↓
Feature Engineering
        ↓
Training Dataset Generation
        ↓
Model Training
        ↓
Serialized Model Artifacts
        ↓
Inference APIs
        ↓
AI Recommendations
```

---

# Repository Structure

```text
predictive-planner/
│
├── frontend/             # React application
│
├── backend-node/         # Express APIs & workflow engine
│
├── ml-service/           # FastAPI ML service & training scripts
│
├── database/
│   └── predictive_planner_v2.sql
│
└── README.md
```

---

# Prerequisites

Install these before running locally:

* Node.js 18+
* npm
* Python 3.10+
* MariaDB/MySQL 8+
* Git

---

# Installation

## 1. Clone Repository

```bash
git clone <your-repo-url>
cd predictive-planner
```

---

## 2. Database Setup

Create database:

```sql
CREATE DATABASE predictive_planner;
```

Import schema:

```bash
mysql -u root -p predictive_planner < predictive_planner_v2.sql
```

The SQL dump contains:

* workflow tables
* analytics fields
* baseline fields
* snapshot tables
* role masters
* ML operational tables

---

## 3. Frontend Setup

```bash
cd frontend
npm install
```

Create `.env`:

```env
REACT_APP_NODE_API_URL=http://localhost:3001
REACT_APP_ML_API_URL=http://127.0.0.1:8000
```

Run frontend:

```bash
npm start
```

Frontend URL:

```text
http://localhost:3000
```

---

## 4. Backend Setup

```bash
cd backend-node
npm install
```

Create `.env`:

```env
PORT=3001

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=predictive_planner

JWT_SECRET=your_secret

ML_API_URL=http://127.0.0.1:8000

CORS_ALLOWED_ORIGINS=http://localhost:3000
```

Run backend:

```bash
npm run dev
```

or:

```bash
node index.js
```

Backend URL:

```text
http://localhost:3001
```

---

## 5. ML Service Setup

```bash
cd ml-service

python -m venv .venv
```

Activate environment:

### Windows PowerShell

```powershell
.\.venv\Scripts\Activate.ps1
```

### macOS/Linux

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install fastapi uvicorn pandas numpy scikit-learn joblib
```

---

## 6. Train ML Models

```bash
python train.py
```

Training pipeline:

* extracts historical data
* prepares datasets
* performs feature engineering
* trains staffing & effort models
* persists model artifacts

---

## 7. Start ML Service

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

ML service URL:

```text
http://127.0.0.1:8000
```

---

# Startup Sequence

Start services in this order:

```text
1. MariaDB
2. ML Service
3. Backend APIs
4. Frontend
```

---

# Demo Login Accounts

| Role       | Email                                                   | Password |
| ---------- | ------------------------------------------------------- | -------- |
| PM         | [pm@example.com](mailto:pm@test.com)                 | password |
| Leadership | [leadership@example.com](mailto:leadership@test.com) | password |

---

# Operational Dashboard

The operational dashboard provides:

* active project visibility
* pending approvals
* returned items
* CR operational tracking
* workflow queues

### PM Visibility

PMs can access:

* own projects
* own CRs
* own operational queues

### AM Visibility

AMs can access:

* approved projects
* approval queues
* governance operational visibility

---

# Analytics Dashboard

The analytics dashboard compares:

| Metric Type  | Description                   |
| ------------ | ----------------------------- |
| AI Baseline  | AI-generated recommendation   |
| PM Baseline  | approved PM plan              |
| Current Plan | baseline + approved CR impact |
| Actuals      | final delivery outcomes       |

Variance analytics include:

* effort variance
* budget variance
* staffing variance

Severity indicators:

* NORMAL
* MEDIUM
* HIGH
* URGENT

---

# API Summary

## Backend APIs

| Method | Endpoint                     | Purpose                 |
| ------ | ---------------------------- | ----------------------- |
| POST   | `/login`                     | user authentication     |
| GET    | `/projects`                  | project listing         |
| POST   | `/projects`                  | create project          |
| PUT    | `/projects/:id`              | edit project            |
| POST   | `/change-request`            | create CR               |
| POST   | `/progress`                  | save project progress   |
| GET    | `/analytics`                 | analytics dashboard     |
| GET    | `/operational-dashboard`     | operational dashboard   |
| GET    | `/recommend-team/:projectId` | staffing recommendation |

---

## ML APIs

| Method | Endpoint         | Purpose           |
| ------ | ---------------- | ----------------- |
| POST   | `/predict`       | AI recommendation |
| POST   | `/predict-delay` | delivery forecast |
| GET    | `/health`        | ML service health |

---

# Security Model

Authentication:

* JWT-based authentication

Authorization:

* role-based access control

Roles:

* Admin
* PM
* AM / Leadership

Visibility filtering is enforced server-side.

---

# AWS / Azure Deployment

The platform is cloud-ready.

Recommended deployment topology:

```text
Users
   ↓
Load Balancer
   ↓
React Frontend
   ↓
Node.js Backend APIs
   ↓
MariaDB + Python ML Service
```

Recommended services:

* EC2 / ECS
* RDS MariaDB
* S3 + CloudFront
* CloudWatch

---

# Development Notes

* Baselines are immutable after approval.
* Approved CRs modify current planning only.
* Resource loading drives planned effort and budget.
* ML recommendations are advisory and preserved separately from PM plans.
* Analytics compare:

  * AI baseline
  * PM baseline
  * current plan
  * actuals

---

# Troubleshooting

## Cannot GET /api/...

Usually caused by:

* backend not restarted
* incorrect route registration
* wrong API URL

---

## ML Recommendation Issues

Potential causes:

* model artifacts missing
* inference feature mismatch
* incorrect payload mapping

---

## Empty Team Recommendations

Potential causes:

* insufficient staffing history
* missing role mappings
* feature engineering mismatch

---

## CORS Issues

Verify:

* frontend origin added to backend `CORS_ALLOWED_ORIGINS`
* frontend rebuilt after `.env` updates

---

# Future Enhancements

Potential roadmap:

* portfolio analytics
* resource forecasting
* utilization forecasting
* delivery risk scoring
* cloud-native deployment
* Kubernetes orchestration
* advanced ML models

---

# Design Principles

The platform is built around:

* predictive governance
* immutable baselines
* historical delivery intelligence
* workflow-driven approvals
* analytics-first visibility
* modular architecture

---

# Conclusion

Predictive Planner demonstrates how:

* AI-driven planning
* workflow governance
* operational visibility
* delivery analytics
* historical intelligence

can be unified into a scalable enterprise project planning ecosystem.
