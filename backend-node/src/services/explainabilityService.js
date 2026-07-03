const axios = require('axios');
const { pool } = require('../config/db.config');

const DEFAULT_ML_API_URL = 'http://127.0.0.1:8000';
const normalizeUrl = (url) => String(url || DEFAULT_ML_API_URL).replace(/\/+$/, '');
const ML_API_URL = normalizeUrl(process.env.ML_API_URL || DEFAULT_ML_API_URL);

const cache = new Map();
const CACHE_TTL_MS = Number(process.env.EXPLAINABILITY_CACHE_TTL_MS || 5 * 60 * 1000);

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
      SELECT p.project_id AS projectId, p.updated_at AS updatedAt
      FROM project p
      WHERE p.project_id = ?
        AND ${visibility.sql}
      LIMIT 1
    `,
    [projectId, ...visibility.params],
  );
  return rows[0] || null;
}

async function getForecastExplainability(user, projectId) {
  const project = await canAccessProject(user, projectId);
  if (!project) {
    const error = new Error('Access forbidden for this project');
    error.status = 403;
    throw error;
  }

  const cacheKey = `${projectId}:${project.updatedAt ? new Date(project.updatedAt).getTime() : ''}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const response = await axios.post(
    `${ML_API_URL}/predict/explainability`,
    { projectId },
    { timeout: 15000 },
  );
  const value = response.data;
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

module.exports = {
  getForecastExplainability,
};
