const axios = require('axios');
const { pool } = require('../config/db.config');

const DEFAULT_ML_API_URL = 'http://127.0.0.1:8000';
const normalizeUrl = (url) => String(url || DEFAULT_ML_API_URL).replace(/\/+$/, '');
const ML_API_URL = normalizeUrl(process.env.ML_API_URL || DEFAULT_ML_API_URL);

function normalizeRole(user) {
  const role = String(user?.role || '').toUpperCase();
  return role === 'AM' ? 'ACCOUNT_MANAGER' : role;
}

function visibilityWhere(user, projectAlias = 'p', draftAlias = 'pd') {
  const role = normalizeRole(user);
  if (role === 'ADMIN') return { sql: '1 = 1', params: [] };
  if (role === 'PM') {
    return {
      sql: `(${projectAlias}.owner_id = ? OR ${draftAlias}.submitted_by_user_id = ?)`,
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
          WHERE assigned_pm.user_id = COALESCE(${draftAlias}.submitted_by_user_id, ${projectAlias}.owner_id)
            AND assigned_pm.manager_id = ?
        )
      )`,
      params: [user.userId, user.userId],
    };
  }
  return { sql: '1 = 0', params: [] };
}

async function tableColumnExists(tableName, columnName) {
  const [rows] = await pool.promise().query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function canAccessProject(user, projectId) {
  const visibility = visibilityWhere(user);
  const [rows] = await pool.promise().query(
    `
      SELECT p.project_id AS projectId
      FROM project p
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
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
  const hasRegressionColumn = await tableColumnExists('project', 'is_regression_data');
  const regressionFilter = hasRegressionColumn ? 'AND COALESCE(p.is_regression_data, 0) = 0' : '';
  const [rows] = await pool.promise().query(
    `
      SELECT p.project_id AS projectId
      FROM project p
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
      WHERE ${visibility.sql}
        AND pd.workflow_status IN ('COMPLETE', 'CLOSED')
        AND COALESCE(UPPER(p.project_type), UPPER(JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.basicInfo.project_type'))), '') <> 'TEST DATA'
        ${regressionFilter}
      ORDER BY p.actual_completion_date DESC, p.project_id DESC
      LIMIT 500
    `,
    visibility.params,
  );
  return rows.map((row) => Number(row.projectId)).filter(Boolean);
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

  const response = await axios.post(
    `${ML_API_URL}/predict/similar-projects`,
    { projectId, candidateProjectIds, topN: 3 },
    { timeout: 15000 },
  );
  return response.data;
}

module.exports = {
  getSimilarHistoricalProjects,
};
