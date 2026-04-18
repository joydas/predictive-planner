# Predictive Planner

Predictive Planner is a full-stack project planning application that helps teams estimate effort, track scope change, monitor delivery progress, and assemble a suitable delivery team. It combines a React frontend, a Node.js/Express API layer, a Python/FastAPI ML service, and a MySQL database.

## Purpose

This app is intended to support project managers, admins, and leadership teams with:

- AI-assisted effort prediction when a project is created
- Scope creep handling through change requests
- Progress-based effort forecasting
- Team recommendation based on project technology, complexity, and available resources
- Portfolio visibility through a dashboard and project list

## Architecture

| Layer | Folder | Tech | Default Port | Responsibility |
| --- | --- | --- | --- | --- |
| Frontend | `frontend/` | React + CoreUI | `3000` | Login, dashboard, projects, forms, team recommendation UI |
| Backend | `backend-node/` | Node.js + Express + MySQL | `3001` | Authentication, project APIs, DB access, ML orchestration |
| ML Service | `ml-service/` | FastAPI + scikit-learn | `8000` | Effort prediction and progress-based forecast |
| Database | external | MySQL | n/a | Stores users, projects, change requests, progress, resources |

## Main Workflows

1. A PM or admin creates a project in the React app.
2. The Node backend calls the ML service `/predict` endpoint and stores `predicted_hours` in MySQL.
3. Change requests are recorded in MySQL and trigger a refreshed prediction.
4. Progress entries are stored in MySQL and can be sent to the ML service `/predict-delay` endpoint.
5. Team recommendations are generated from project data plus rows in the `resources` table.
6. Leadership can view aggregated project risk and effort variance in the dashboard.

## Repository Layout

```text
predictive-planner/
|-- frontend/        # React application
|-- backend-node/    # Express API and MySQL integration
|-- ml-service/      # FastAPI ML service and training scripts
`-- README.md
```

## Prerequisites

Install these before running the app locally:

- Node.js 18+ and npm
- Python 3.10+ with `pip`
- MySQL 8+ or compatible

## Installation

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd predictive-planner
```

### 2. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 3. Install backend dependencies

```bash
cd backend-node
npm install
cd ..
```

### 4. Install ML dependencies

There is no `requirements.txt` yet, so install the Python packages directly.

```bash
cd ml-service
python -m venv .venv
```

Activate the virtual environment:

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

Install packages:

```bash
pip install fastapi uvicorn pandas numpy scikit-learn joblib
cd ..
```

## Database Setup

### Current schema

The schema below matches the fields currently used by the running code. This is different from the old README in a few important ways:

- `frontend/` is now React, not static HTML
- the backend runs on port `3001`, not `3000`
- `project_progress.tasks_completed` should be `TEXT`, not an integer
- `resources` must include `role` and `technology` for team recommendation to work

Run the following in MySQL:

```sql
CREATE DATABASE IF NOT EXISTS predictive_planner;
USE predictive_planner;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'pm', 'leadership') NOT NULL
);

CREATE TABLE projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    business_unit VARCHAR(100) NOT NULL,
    technology VARCHAR(100) NOT NULL,
    complexity INT NOT NULL,
    team_size INT NOT NULL,
    estimated_hours FLOAT NOT NULL,
    predicted_hours FLOAT DEFAULT NULL,
    avg_experience FLOAT NOT NULL,
    technology_score FLOAT NOT NULL,
    created_by INT NOT NULL,
    CONSTRAINT fk_projects_created_by
        FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE change_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    description TEXT NOT NULL,
    impact_hours FLOAT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    created_by INT NOT NULL,
    CONSTRAINT fk_change_requests_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_change_requests_created_by
        FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE project_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    date DATE NOT NULL,
    effort_spent FLOAT NOT NULL,
    tasks_completed TEXT NOT NULL,
    CONSTRAINT fk_project_progress_project
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    technology VARCHAR(100) NULL,
    experience_years FLOAT NOT NULL,
    availability INT NOT NULL,
    cost_per_hour FLOAT DEFAULT NULL
);
```

### Seed demo data

These records line up with the current React login screen and the backend role handling.

```sql
INSERT INTO users (name, email, password, role) VALUES
('Admin User', 'admin@example.com', 'password', 'admin'),
('PM User', 'pm@example.com', 'password', 'pm'),
('Leadership User', 'leadership@example.com', 'password', 'leadership');

INSERT INTO resources (name, role, technology, experience_years, availability, cost_per_hour) VALUES
('Ava React Dev', 'Developer', 'react', 6, 80, 75),
('Victor Vue Dev', 'Developer', 'vue', 5, 70, 72),
('Anika Angular Dev', 'Developer', 'angular', 6, 65, 78),
('Noah Node Dev', 'Developer', 'node', 5, 85, 74),
('Priya Python Dev', 'Developer', 'python', 7, 75, 82),
('Jay Java Dev', 'Developer', 'java', 8, 70, 88),
('Dina DotNet Dev', 'Developer', 'dotnet', 6, 68, 80),
('Quinn QA', 'QA', NULL, 5, 80, 45),
('Ethan BA', 'BA', NULL, 6, 75, 55),
('Olivia PM', 'PM', NULL, 8, 60, 95),
('Mia UX', 'UX', NULL, 5, 70, 58),
('Lucas UI', 'UI', NULL, 4, 78, 52);
```

Important notes for `resources`:

- `role` values should match the backend logic exactly: `Developer`, `QA`, `BA`, `PM`, `UX`, `UI`
- developer `technology` values should match project technology values exactly: `react`, `vue`, `angular`, `node`, `python`, `java`, `dotnet`
- if a project needs more developers than you have matching resource rows, the recommendation will return a smaller team than desired

## Configuration

### Backend database connection

The backend currently uses a hardcoded MySQL connection in [backend-node/index.js](/C:/OurWorkspace/Dipanjan/AI/predictive-planner/backend-node/index.js:12).

Update this block if your local MySQL credentials differ:

```js
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "predictive_planner",
});
```

### Frontend service URLs

The frontend reads service URLs from [frontend/src/config.js](/C:/OurWorkspace/Dipanjan/AI/predictive-planner/frontend/src/config.js:3).

You can optionally create `frontend/.env` with:

```bash
REACT_APP_NODE_API_URL=http://localhost:3001
REACT_APP_ML_API_URL=http://localhost:8000
```

`REACT_APP_NODE_API_URL` is the one the current UI actually uses. `REACT_APP_ML_API_URL` is defined in config for future/direct use, but the current frontend talks to the ML service through the backend for user flows.

## Running the Application

Start the services in this order.

### 1. Run the ML service

```bash
cd ml-service
python train.py
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

What this does:

- `python train.py` trains a demo model from `project_data.csv` and creates `model.pkl`
- `uvicorn main:app --reload` starts the FastAPI service used by the backend

ML service URL:

```text
http://127.0.0.1:8000
```

### 2. Run the Node.js backend

In a second terminal:

```bash
cd backend-node
node index.js
```

Optional development mode:

```bash
cd backend-node
npm run dev
```

Backend URL:

```text
http://localhost:3001
```

### 3. Run the React frontend

In a third terminal:

```bash
cd frontend
npm start
```

Frontend URL:

```text
http://localhost:3000
```

Open the app in a browser:

```text
http://localhost:3000/login
```

## Demo Login Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `password` |
| PM | `pm@example.com` | `password` |
| Leadership | `leadership@example.com` | `password` |

## How to Use the App

### Project manager / admin flow

1. Log in with a PM or admin account.
2. Open `Projects` to view the current portfolio.
3. Open `Create Project` and enter:
   - project name
   - business unit
   - technology
   - complexity
   - team size
   - estimated hours
   - average experience
   - technology score
4. Submit the form to create the project and store the ML prediction.
5. From the project list, use:
   - `Progress` to record delivery updates and request a final effort forecast
   - `Change Request` to log scope change and refresh the prediction
   - `Team` to fetch a recommended team composition

### Leadership flow

1. Log in with a leadership account.
2. Open the dashboard to review:
   - project counts
   - estimated vs predicted effort
   - business unit distribution
   - risk badges derived from variance

## API Summary

### Backend endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Health check |
| `POST` | `/login` | User login |
| `GET` | `/projects` | List projects and computed variance |
| `POST` | `/projects` | Create project and call ML prediction |
| `POST` | `/change-request` | Create a change request and update prediction |
| `POST` | `/progress` | Save progress data |
| `GET` | `/project-delay/:id` | Predict final effort from progress history |
| `GET` | `/recommend-team/:projectId` | Recommend team composition from project + resources |

### ML endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Health check |
| `POST` | `/predict` | Predict project effort |
| `POST` | `/predict-delay` | Forecast final effort from progress history |

## Development Notes

- The backend currently stores and compares passwords in plain text. That is acceptable only for local demo use.
- If MySQL is unavailable, `GET /projects` falls back to sample project rows. Other DB-backed operations still require a working database.
- The team recommendation logic uses `predicted_hours / 160` to estimate the number of developers needed.
- The progress forecast is a simple linear regression over submitted `effort_spent` values and should be treated as a demo model, not production forecasting.

## Troubleshooting

- Login fails: confirm the demo users were inserted into `users` and the backend is pointed at the correct MySQL instance.
- Project creation returns `ML service error`: make sure `python train.py` was run and the FastAPI service is listening on `127.0.0.1:8000`.
- Team recommendation is empty: check that `resources.role` values match the backend values exactly and that developer `technology` matches the project technology.
- Frontend cannot reach backend: verify `REACT_APP_NODE_API_URL` or the default `http://localhost:3001`, then restart `npm start`.

## Future Improvements

- Move backend config to environment variables
- Add migrations and seed scripts
- Add `requirements.txt` for the ML service
- Hash passwords and add proper auth tokens/session handling
- Improve ML models and retraining workflow
