# 🚀 Predictive Project & Resource Planning System

An AI-powered full-stack application that predicts project effort, tracks scope creep, forecasts delays, and recommends optimal team composition.

---

## 🎯 Features

### 👨‍💻 Program Manager
- Create projects
- Add change requests
- Track project progress
- View ML-based effort prediction

### 👨‍💼 Leadership
- View project portfolio
- Effort variance (Estimated vs Predicted)
- Risk indicators
- Charts & analytics

### 🤖 ML Capabilities
- Effort prediction (ML model)
- Scope creep adjustment
- Time-series delay prediction
- Team recommendation engine

---

## 🛠️ Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js (Express)
- **ML Service**: Python (FastAPI, scikit-learn)
- **Database**: MySQL

---

## ⚙️ Setup Instructions

---

### 1️⃣ Clone Repository

```bash
git clone <your-repo-url>
cd predictive-planner

2️⃣ Setup MySQL Database
Open MySQL Workbench and run:

CREATE DATABASE predictive_planner;
USE predictive_planner;

-- USERS
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    email VARCHAR(100),
    password VARCHAR(255),
    role ENUM('admin','pm','leadership')
);

-- PROJECTS
CREATE TABLE projects (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255),
    business_unit VARCHAR(100),
    technology VARCHAR(100),
    complexity INT,
    team_size INT,
    estimated_hours FLOAT,
    predicted_hours FLOAT,
    actual_hours FLOAT,
    avg_experience FLOAT,
    technology_score INT,
    start_date DATE,
    end_date DATE,
    created_by INT
);

-- CHANGE REQUESTS
CREATE TABLE change_requests (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT,
    description TEXT,
    impact_hours FLOAT,
    status VARCHAR(50),
    created_by INT
);

-- RESOURCES
CREATE TABLE resources (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    skill VARCHAR(100),
    experience_years FLOAT,
    availability INT,
    cost_per_hour FLOAT
);

-- PROJECT PROGRESS
CREATE TABLE project_progress (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT,
    date DATE,
    effort_spent FLOAT,
    tasks_completed INT
);

INSERT INTO users (name, email, password, role) VALUES
('Admin User', 'admin@test.com', 'admin123', 'admin'),
('PM User', 'pm@test.com', 'pm123', 'pm'),
('Leader User', 'leader@test.com', 'leader123', 'leadership');

INSERT INTO resources (name, skill, experience_years, availability, cost_per_hour) VALUES
('Dev A', 'NodeJS', 5, 80, 500),
('Dev B', 'NodeJS', 3, 60, 400),
('QA A', 'Testing', 4, 70, 300),
('DevOps A', 'DevOps', 6, 50, 600);

▶️ Running the Application
1️⃣ Start ML Service
cd ml-service
python -m venv venv
venv\Scripts\activate

pip install pandas scikit-learn fastapi uvicorn joblib

python train.py
uvicorn main:app --reload

ML runs at: http://127.0.0.1:8000

2️⃣ Start Backend
cd backend-node
npm install
node index.js

Backend runs at: http://localhost:3000

3️⃣ Open Application
http://localhost:3000/login.html

🔑 Test Users
| Role       | Email                                     | Password  |
| ---------- | ----------------------------------------- | --------- |
| Admin      | [admin@test.com](mailto:admin@test.com)   | admin123  |
| PM         | [pm@test.com](mailto:pm@test.com)         | pm123     |
| Leadership | [leader@test.com](mailto:leader@test.com) | leader123 |


📊 Key Workflows
Login as PM
Create Project → ML predicts effort
Add Change Request → prediction updates
Add Progress → delay prediction
View Team Recommendation
Login as Leadership → view dashboard
