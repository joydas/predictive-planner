const axios = require('axios');
const { pool } = require('../config/db.config');

const DEFAULT_ML_API_URL = 'http://127.0.0.1:8000';
const normalizeUrl = (url) => String(url || DEFAULT_ML_API_URL).replace(/\/+$/, '');
const ML_API_URL = normalizeUrl(process.env.ML_API_URL || DEFAULT_ML_API_URL);

function normalizeRole(user) {
  const role = String(user?.role || '').toUpperCase();
  return role === 'AM' ? 'ACCOUNT_MANAGER' : role;
}

function visibilityWhere(user, projectAlias = 'p') {
  const role = normalizeRole(user);
  if (role === 'ADMIN') return { sql: '1 = 1', params: [] };
  if (role === 'PM') {
    return {
      sql: `(${projectAlias}.owner_id = ? OR ${projectAlias}.submitted_by_user_id = ?)`,
      params: [user.userId, user.userId],
    };
  }
  if (role === 'ACCOUNT_MANAGER') {
    return {
      sql: `(
        ${projectAlias}.approved_by_user_id = ?
        OR EXISTS (
          SELECT 1
          FROM app_user assigned_pm
          WHERE assigned_pm.user_id = COALESCE(${projectAlias}.submitted_by_user_id, ${projectAlias}.owner_id)
            AND assigned_pm.manager_id = ?
        )
      )`,
      params: [user.userId, user.userId],
    };
  }
  return { sql: '1 = 0', params: [] };
}

async function canAccessProject(user, projectId) {
  const visibility = visibilityWhere(user);
  const [rows] = await pool.promise().query(
    `
      SELECT p.project_id AS projectId
      FROM project p
      WHERE p.project_id = ?
        AND ${visibility.sql}
      LIMIT 1
    `,
    [projectId, ...visibility.params],
  );
  return rows.length > 0;
}

async function visibleCompletedBusinessProjectIds(user) {
  const visibility = visibilityWhere(user);
  const regressionFilter = 'AND COALESCE(p.is_regression_data, 0) = 0';
  
  // Try to find completed projects first
  let [rows] = await pool.promise().query(
    `
      SELECT p.project_id AS projectId
      FROM project p
      WHERE ${visibility.sql}
        AND p.workflow_status IN ('COMPLETED', 'COMPLETE', 'CLOSED')
        AND COALESCE(UPPER(p.project_type), UPPER(JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.basicInfo.project_type'))), '') <> 'TEST DATA'
        ${regressionFilter}
      ORDER BY p.actual_completion_date DESC, p.project_id DESC
      LIMIT 500
    `,
    visibility.params,
  );

  // Fallback: If no completed projects, include active projects
  if (rows.length === 0) {
    [rows] = await pool.promise().query(
      `
        SELECT p.project_id AS projectId
        FROM project p
        WHERE ${visibility.sql}
          AND COALESCE(UPPER(p.project_type), UPPER(JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.basicInfo.project_type'))), '') <> 'TEST DATA'
          ${regressionFilter}
        ORDER BY p.created_at DESC
        LIMIT 500
      `,
      visibility.params,
    );
  }
  
  return rows.map((row) => Number(row.projectId)).filter(Boolean);
}

async function getProjectDetails(projectIds) {
  if (!projectIds || !projectIds.length) return [];
  const [rows] = await pool.promise().query(
    `
      SELECT 
        ap.project_id AS projectId,
        ap.project_name AS projectName,
        COALESCE(ap.technology_stack, JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.technology.technology_stack'))) AS technologyStack,
        COALESCE(ap.project_type, JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.basicInfo.project_type'))) AS projectType,
        COALESCE(ap.delivery_model, JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.basicInfo.delivery_model'))) AS deliveryModel,
        COALESCE(ap.estimated_team_size, JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.financial.estimated_team_size')), 0) AS teamSize,
        COALESCE(ap.actual_team_size, 0) AS actualTeamSize,
        COALESCE(ap.budget, JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.financial.budget')), 0) AS plannedBudget,
        COALESCE(ap.actual_budget, 0) AS actualBudget,
        COALESCE(ap.planned_effort, JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.financial.planned_effort')), 0) AS plannedEffort,
        COALESCE(ap.actual_effort, 0) AS actualEffort,
        ap.start_date AS startDate,
        ap.planned_end_date AS plannedEndDate,
        ap.actual_completion_date AS actualCompletionDate,
        ap.industry,
        ap.workflow_status AS status,
        (SELECT COUNT(*) FROM change_request cr WHERE cr.project_id = ap.project_id AND cr.workflow_status = 'APPROVED') AS approvedCrCount
      FROM project ap
      WHERE ap.project_id IN (?)
    `,
    [projectIds]
  );

  return rows.map(r => {
    let duration = 0;
    if (r.startDate && r.actualCompletionDate) {
      duration = Math.ceil((new Date(r.actualCompletionDate) - new Date(r.startDate)) / (1000 * 60 * 60 * 24));
    } else if (r.startDate && r.plannedEndDate) {
      duration = Math.ceil((new Date(r.plannedEndDate) - new Date(r.startDate)) / (1000 * 60 * 60 * 24));
    }
    
    return {
      projectId: r.projectId,
      projectName: r.projectName,
      technologyStack: String(r.technologyStack || '').toUpperCase().trim(),
      projectType: String(r.projectType || '').toUpperCase().trim(),
      deliveryModel: String(r.deliveryModel || '').toUpperCase().trim(),
      teamSize: Number(r.teamSize) || 0,
      actualTeamSize: Number(r.actualTeamSize) || 0,
      budget: Number(r.plannedBudget) || 0,
      actualBudget: Number(r.actualBudget) || 0,
      plannedEffort: Number(r.plannedEffort) || 0,
      actualEffort: Number(r.actualEffort) || 0,
      actualDurationDays: duration,
      industry: String(r.industry || '').toUpperCase().trim(),
      status: r.status,
      completedOnTime: r.actualCompletionDate && r.plannedEndDate ? new Date(r.actualCompletionDate) <= new Date(r.plannedEndDate) : true,
      approvedCrCount: Number(r.approvedCrCount) || 0
    };
  });
}

function calculateSimilarity(target, candidate) {
  let score = 0;
  const factors = [];

  // Technology Stack (35)
  if (target.technologyStack && target.technologyStack === candidate.technologyStack) {
    score += 35;
    factors.push(`Technology (${target.technologyStack})`);
  }

  // Project Type (20)
  if (target.projectType && target.projectType === candidate.projectType) {
    score += 20;
    factors.push(`Project Type (${target.projectType})`);
  }

  // Delivery Model (15)
  if (target.deliveryModel && target.deliveryModel === candidate.deliveryModel) {
    score += 15;
    factors.push(`Delivery Model (${target.deliveryModel})`);
  }

  // Team Size (10)
  const teamDiff = Math.abs(target.teamSize - candidate.teamSize);
  const maxTeam = Math.max(target.teamSize, candidate.teamSize) || 1;
  const teamRatio = 1 - (teamDiff / maxTeam);
  if (teamRatio > 0.8) {
    score += 10;
    factors.push('Similar Team Size');
  } else if (teamRatio > 0) {
    score += 10 * teamRatio;
  }

  // Budget Range (10)
  const budgetDiff = Math.abs(target.budget - candidate.budget);
  const maxBudget = Math.max(target.budget, candidate.budget) || 1;
  const budgetRatio = 1 - (budgetDiff / maxBudget);
  if (budgetRatio > 0.8) {
    score += 10;
    factors.push('Similar Budget');
  } else if (budgetRatio > 0) {
    score += 10 * budgetRatio;
  }

  // Duration (5)
  const durDiff = Math.abs(target.actualDurationDays - candidate.actualDurationDays);
  const maxDur = Math.max(target.actualDurationDays, candidate.actualDurationDays) || 1;
  const durRatio = 1 - (durDiff / maxDur);
  if (durRatio > 0.8) {
    score += 5;
    factors.push('Similar Duration');
  } else if (durRatio > 0) {
    score += 5 * durRatio;
  }

  // Industry (5)
  if (target.industry && target.industry === candidate.industry) {
    score += 5;
    factors.push('Same Industry');
  }

  return {
    ...candidate,
    similarityScore: Math.round(score),
    similarity: Math.round(score), // for UI compatibility
    matchingFactors: factors,
    technology: candidate.technologyStack // for UI mapping
  };
}

async function getSimilarHistoricalProjects(user, projectId) {
  const allowed = await canAccessProject(user, projectId);
  if (!allowed) {
    const error = new Error('Access forbidden for this project');
    error.status = 403;
    throw error;
  }

  const candidateProjectIds = await visibleCompletedBusinessProjectIds(user);
  if (!candidateProjectIds.length) {
    return {
      projectId,
      similarProjects: [],
      message: 'No completed historical projects are available for similarity analysis.',
    };
  }

  const allIds = Array.from(new Set([Number(projectId), ...candidateProjectIds]));
  const projects = await getProjectDetails(allIds);
  
  const targetProject = projects.find(p => p.projectId === Number(projectId));
  if (!targetProject) {
    return { projectId, similarProjects: [] };
  }

  const candidates = projects.filter(p => p.projectId !== Number(projectId));
  const scored = candidates.map(cand => calculateSimilarity(targetProject, cand));
  
  scored.sort((a, b) => b.similarityScore - a.similarityScore);
  
  return {
    projectId,
    similarProjects: scored.slice(0, 3)
  };
}

module.exports = {
  getSimilarHistoricalProjects,
};
