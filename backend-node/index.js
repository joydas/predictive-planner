const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// DB connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "", // change if needed
  database: "predictive_planner"
});

db.connect(err => {
  if (err) {
    console.error("DB connection failed:", err);
  } else {
    console.log("Connected to MySQL");
  }
});

// test route
app.get("/", (req, res) => {
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
    const mlResponse = await axios.post("http://127.0.0.1:8000/predict", {
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
  const query = "SELECT *,(predicted_hours - estimated_hours) AS variance FROM projects";

  db.query(query, (err, results) => {
    if (err) return res.status(500).send(err);

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
          const mlResponse = await axios.post("http://127.0.0.1:8000/predict", {
            team_size: project.team_size,
            complexity: project.complexity,
            change_count: change_count,
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

    const mlResponse = await axios.post("http://127.0.0.1:8000/predict-delay", {
      progress: results
    });

    res.json(mlResponse.data);
  });
});

//GET TEAM RECOMMENDATION
app.get("/recommend-team/:projectId", (req, res) => {
  const projectId = req.params.projectId;

  // Step 1: Get project details
  const projectQuery = "SELECT * FROM projects WHERE id = ?";

  db.query(projectQuery, [projectId], (err, projectRes) => {
    if (err) return res.status(500).send(err);

    const project = projectRes[0];

    // Step 2: Get resources
    const resourceQuery = "SELECT * FROM resources";

    db.query(resourceQuery, (err, resources) => {
      if (err) return res.status(500).send(err);

      // Step 3: Filter relevant skills
      const relevant = resources.filter(r =>
        r.skill.toLowerCase().includes(project.technology.toLowerCase()) ||
        r.skill.toLowerCase().includes("testing") ||
        r.skill.toLowerCase().includes("devops")
      );

      // Step 4: Sort by experience + availability
      relevant.sort((a, b) =>
        (b.experience_years + b.availability/100) -
        (a.experience_years + a.availability/100)
      );

      // Step 5: Pick top resources based on effort
      const teamSize = Math.ceil(project.predicted_hours / 150); // 150 is productive hrs per month per resource

      const team = relevant.slice(0, teamSize);

      res.json({
        project: project.name,
        recommended_team_size: teamSize,
        team
      });
    });
  });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});