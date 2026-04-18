const fs = require("fs");
const path = require("path");
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const axios = require("axios");

const DEFAULT_PORT = 3001;
const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";
const DEFAULT_CORS_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];
const DEFAULT_DB_CONFIG = {
  host: "localhost",
  port: 3306,
  user: "root",
  password: "",
  database: "predictive_planner",
  connectionLimit: 10,
  queueLimit: 0
};

const loadLocalEnv = () => {
  const envPath = path.join(__dirname, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const envContent = fs.readFileSync(envPath, "utf8");

  for (const line of envContent.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
};

const normalizeUrl = (url) => url.replace(/\/+$/, "");
const getFirstEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];

    if (value !== undefined && value !== "") {
      return value;
    }
  }

  return undefined;
};
const parseEnvNumber = (value, fallback) => {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};
const parseAllowedOrigins = (value) =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

loadLocalEnv();

const PORT = Number(process.env.PORT || DEFAULT_PORT);
const ML_API_URL = normalizeUrl(process.env.ML_API_URL || DEFAULT_ML_API_URL);
const allowedOrigins = parseAllowedOrigins(
  process.env.CORS_ALLOWED_ORIGINS || DEFAULT_CORS_ALLOWED_ORIGINS.join(",")
);
const allowAllOrigins = allowedOrigins.includes("*");
const DB_CONFIG = {
  host: getFirstEnv("DB_HOST", "MYSQL_HOST") || DEFAULT_DB_CONFIG.host,
  port: parseEnvNumber(
    getFirstEnv("DB_PORT", "MYSQL_PORT"),
    DEFAULT_DB_CONFIG.port
  ),
  user:
    getFirstEnv("DB_USER", "DB_USERNAME", "MYSQL_USER") ||
    DEFAULT_DB_CONFIG.user,
  password:
    getFirstEnv("DB_PASSWORD", "MYSQL_PASSWORD") ||
    DEFAULT_DB_CONFIG.password,
  database:
    getFirstEnv("DB_NAME", "MYSQL_DATABASE") ||
    DEFAULT_DB_CONFIG.database,
  waitForConnections: true,
  connectionLimit: parseEnvNumber(
    process.env.DB_CONNECTION_LIMIT,
    DEFAULT_DB_CONFIG.connectionLimit
  ),
  queueLimit: parseEnvNumber(
    process.env.DB_QUEUE_LIMIT,
    DEFAULT_DB_CONFIG.queueLimit
  )
};
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
app.use(cors(corsOptions));
app.use(express.static("public"));

// DB connection pool
const db = mysql.createPool(DB_CONFIG);

let dbConnected = false;

const sampleProjects = [
  {
    id: 1,
    name: "Sample Project A",
    business_unit: "Operations",
    predicted_hours: 120
  },
  {
    id: 2,
    name: "Sample Project B",
    business_unit: "Technology",
    predicted_hours: 210
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

//actual routes (later to shift to different file)

//LOGIN
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const query = "SELECT * FROM users WHERE email = ? AND password = ?";

  db.query(query, [email, password], (err, results) => {
    if (err) return res.status(500).send(err);

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = results[0];

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      }
    });
  });
});

//CREATE PROJECT
app.post("/projects", async (req, res) => {
  try {
    const {
    name,
    business_unit,
    technology,
    complexity,
    team_size,
    estimated_hours,
    created_by,
    avg_experience,
    technology_score
    } = req.body;

    

    // Step 1: Call ML API
    const mlResponse = await axios.post(`${ML_API_URL}/predict`, {
      team_size,
      complexity,
      change_count:0,
      avg_experience,
      technology_score
    });

    const predicted_hours = mlResponse.data.predicted_hours;
    const explanation = mlResponse.data.explanation;

    // Step 2: Store in DB
    const query = `
      INSERT INTO projects 
      (name, business_unit, technology, complexity, team_size, estimated_hours, predicted_hours,
      avg_experience,technology_score, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?,?,?)
    `;

    db.query(
      query,
      [
        name,
        business_unit,
        technology,
        complexity,
        team_size,
        estimated_hours,
        predicted_hours,
        avg_experience,
        technology_score,
        created_by
      ],
      (err, result) => {
        if (err) return res.status(500).send(err);

        res.json({
          message: "Project created with prediction",
          projectId: result.insertId,
          predicted_hours,
          explanation
        });
      }
    );

  } catch (error) {
    console.error(error.message);
    res.status(500).send("ML service error");
  }
});

//GET LIST OF PROJECTS
app.get("/projects", (req, res) => {
  if (!dbConnected) {
    console.warn("DB unavailable - returning sample project data");
    return res.json(sampleProjects);
  }

  const query = "SELECT *,(predicted_hours - estimated_hours) AS variance FROM projects";

  db.query(query, (err, results) => {
    if (err) {
      console.error("Project query failed:", err);
      return res.status(500).send(err);
    }

    res.json(results);
  });
});


//CHANGE REQUEST
app.post("/change-request", async (req, res) => {
  try {
    const { project_id, description, impact_hours, created_by } = req.body;

           

    // Step 1: Insert CR
    const insertCR = `
      INSERT INTO change_requests (project_id, description, impact_hours, status, created_by)
      VALUES (?, ?, ?, 'OPEN', ?)
    `;

    db.query(insertCR, [project_id, description, impact_hours, created_by], async (err) => {
      if (err) return res.status(500).send(err);

      // Step 2: Count total CRs for this project
      const countQuery = `
        SELECT COUNT(*) AS cr_count FROM change_requests WHERE project_id = ?
     `;

      db.query(countQuery, [project_id], async (err, result) => {
        if (err) return res.status(500).send(err);

        const change_count = result[0].cr_count;

        // Step 3: Get project data
        const projQuery = "SELECT * FROM projects WHERE id = ?";
        db.query(projQuery, [project_id], async (err, projRes) => {
          if (err) return res.status(500).send(err);

          const project = projRes[0];

           // Step 4: Call ML with updated change_count
          const mlResponse = await axios.post(`${ML_API_URL}/predict`, {
            team_size: project.team_size,
            complexity: project.complexity,
            change_count,
            avg_experience: project.avg_experience,
            technology_score: project.technology_score
        });

          const new_prediction = mlResponse.data.predicted_hours;


          // Step 5: Update project prediction
          const updateQuery = `
            UPDATE projects SET predicted_hours = ? WHERE id = ?
          `;

          db.query(updateQuery, [new_prediction, project_id], (err) => {
            if (err) return res.status(500).send(err);

            res.json({
              message: "Change Request added & prediction updated",
              new_prediction
            });
          });
        });
      });
    });

  } catch (error) {
    res.status(500).send("Error processing CR");
  }
});

//PROJECT PROGRESS
app.post("/progress", (req, res) => {
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
app.get("/recommend-team/:projectId", (req, res) => {
  const projectId = req.params.projectId;

  // Step 1: Get project details
  const projectQuery = "SELECT * FROM projects WHERE id = ?";

  db.query(projectQuery, [projectId], (err, projectRes) => {
    
    if (err) return res.status(500).send(err);

    const project = projectRes[0];

    // Step 2: Get all resources
    const resourceQuery = "SELECT * FROM resources";

    db.query(resourceQuery, (err, resources) => {
      if (err) return res.status(500).send(err);

        //res.json({"debug": project.predicted_hours});

      // Step 3: Define required roles
      const requiredRoles = {
        Developer: Math.ceil(project.predicted_hours / 160),
        QA: 1,
        BA: 1,
        PM: 1,
        UX: project.complexity > 3 ? 1 : 0,
        UI: project.complexity > 3 ? 1 : 0
      };

      const team = [];

      // Step 4: Allocate resources role-wise
      Object.keys(requiredRoles).forEach(role => {
        let candidates = resources.filter(r => r.role === role);

        // Developers must match project technology
        if (role === "Developer") {
          candidates = candidates.filter(
            r => r.technology && r.technology.toLowerCase() === project.technology.toLowerCase()
          );
        }

        // Sort by experience + availability
        candidates.sort((a, b) =>
          (b.experience_years + b.availability / 100) -
          (a.experience_years + a.availability / 100)
        );

        // Pick required number
        const selected = candidates.slice(0, requiredRoles[role]);

        team.push(...selected);
      });

      // Step 5: Calculate total team size
      const totalTeamSize = team.length;

      res.json({
        project: project.name,
        technology: project.technology,
        predicted_hours: project.predicted_hours,
        team_composition: requiredRoles,
        recommended_team_size: totalTeamSize,
        team
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`ML service URL: ${ML_API_URL}`);
  console.log(`Database target: ${dbLabel}`);
  console.log(
    `CORS allowed origins: ${allowAllOrigins ? "*" : allowedOrigins.join(", ")}`
  );
});
