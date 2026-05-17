require('dotenv').config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const authRoutes = require("./src/routes/auth.routes");
const authController = require("./src/controllers/auth.controller");
const projectRoutes = require("./src/routes/project.routes");
const projectController = require("./src/controllers/project.controller");
const crRoutes = require("./src/routes/cr.routes");
const crController = require("./src/controllers/cr.controller");
const masterDataRoutes = require("./src/routes/masterData.routes");
const analyticsRoutes = require("./src/routes/analytics.routes");
const resourceRoutes = require("./src/routes/resource.routes");
const projectRepository = require("./src/repositories/project.repository");
const { authenticateToken } = require("./src/middleware/auth.middleware");
const { pool: db, DB_CONFIG } = require("./src/config/db.config");

const DEFAULT_PORT = 3001;
const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";
const DEFAULT_CORS_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

const normalizeUrl = (url) => url.replace(/\/+$/, "");
const parseAllowedOrigins = (value) =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const PORT = Number(process.env.PORT || DEFAULT_PORT);
const ML_API_URL = normalizeUrl(process.env.ML_API_URL || DEFAULT_ML_API_URL);
const allowedOrigins = parseAllowedOrigins(
  process.env.CORS_ALLOWED_ORIGINS || DEFAULT_CORS_ALLOWED_ORIGINS.join(",")
);
const allowAllOrigins = allowedOrigins.includes("*");
const dbLabel = `${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`;

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  }
};

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));
app.use(express.static("public"));

// DB connection pool is provided by src/config/db.config.js
let dbConnected = false;

const sampleProjects = [
  {
    id: 1,
    name: "Sample Project A",
    business_unit: "Operations",
    estimated_hours: 120
  },
  {
    id: 2,
    name: "Sample Project B",
    business_unit: "Technology",
    estimated_hours: 210
  }
];

const tryDbConnect = async () => {
  if (dbConnected) {
    return true;
  }

  try {
    const connection = await db.promise().getConnection();
    connection.release();
    dbConnected = true;
    console.log(`Connected to MySQL at ${dbLabel}`);
    return true;
  } catch (err) {
    dbConnected = false;
    console.error(`DB connection failed for ${dbLabel}:`, err.message || err);
    return false;
  }
};

tryDbConnect();

app.use(async (req, res, next) => {
  if (!dbConnected) {
    await tryDbConnect();
  }
  next();
});

// test route
app.get("/", (req, res) => {
  tryDbConnect();
  console.log("DB Connected:", dbConnected);
  res.send("Backend is running 🚀");
});

// Auth routes are mounted under /api/auth to clearly separate authentication from business APIs
app.use('/api/auth', authRoutes);
app.use('/api/project', projectRoutes);
app.use('/api/cr', crRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/crs', crRoutes);
app.use('/api/master-data', masterDataRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/resources', resourceRoutes);

// Legacy route alias for compatibility with older clients
app.post('/login', authController.login);
app.post('/projects', authenticateToken, projectController.createProject);
app.get('/projects', projectController.listProjects);


//CHANGE REQUEST
app.post("/change-request", authenticateToken, crController.createChangeRequest);

//PROJECT PROGRESS
app.post("/progress", authenticateToken, (req, res) => {
  const { project_id, date, effort_spent, tasks_completed } = req.body;

  const query = `
    INSERT INTO project_progress (project_id, date, effort_spent, tasks_completed)
    VALUES (?, ?, ?, ?)
  `;

  db.query(query, [project_id, date, effort_spent, tasks_completed], (err) => {
    if (err) return res.status(500).send(err);

    res.json({ message: "Progress added" });
  });
});

//GET PROJECT DELAY
app.get("/project-delay/:id", async (req, res) => {
  const projectId = req.params.id;

  const query = "SELECT date, effort_spent FROM project_progress WHERE project_id = ?";

  db.query(query, [projectId], async (err, results) => {
    if (err) return res.status(500).send(err);

    const mlResponse = await axios.post(`${ML_API_URL}/predict-delay`, {
      progress: results
    });

    res.json(mlResponse.data);
  });
});

// GET TEAM RECOMMENDATION
app.get("/recommend-team/:projectId", async (req, res) => {
  const projectId = req.params.projectId;

  try {
    const project = await projectRepository.getSubmittedProjectById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const resourceQuery = "SELECT * FROM resources";
    db.query(resourceQuery, (err, resources) => {
      if (err) return res.status(500).send(err);

      const requiredRoles = {
        Developer: Math.ceil((project.estimated_hours || 0) / 160),
        QA: 1,
        BA: 1,
        PM: 1,
        UX: project.complexity > 3 ? 1 : 0,
        UI: project.complexity > 3 ? 1 : 0,
      };

      const team = [];

      Object.keys(requiredRoles).forEach((role) => {
        let candidates = resources.filter((r) => r.role === role);

        if (role === "Developer") {
          candidates = candidates.filter(
            (r) => r.technology && r.technology.toLowerCase() === (project.technology || '').toLowerCase()
          );
        }

        candidates.sort(
          (a, b) => (b.experience_years + b.availability / 100) - (a.experience_years + a.availability / 100)
        );

        const selected = candidates.slice(0, requiredRoles[role]);
        team.push(...selected);
      });

      const totalTeamSize = team.length;

      res.json({
        project: project.name,
        technology: project.technology,
        estimated_hours: project.estimated_hours,
        team_composition: requiredRoles,
        recommended_team_size: totalTeamSize,
        team,
      });
    });
  } catch (error) {
    console.error('Team recommendation failed:', error);
    res.status(500).json({ message: 'Unable to generate team recommendation' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`ML service URL: ${ML_API_URL}`);
  console.log(`Database target: ${dbLabel}`);
  console.log(
    `CORS allowed origins: ${allowAllOrigins ? "*" : allowedOrigins.join(", ")}`
  );
});
