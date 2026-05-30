const authService = require('./auth.service');
const userRepository = require('../repositories/user.repository');
const axios = require('axios');
const { pool } = require('../config/db.config');

const ROLE_VALUES = ['ADMIN', 'AM', 'PM'];
const DEFAULT_ML_API_URL = 'http://127.0.0.1:8000';
const normalizeUrl = (url) => String(url || DEFAULT_ML_API_URL).replace(/\/+$/, '');
const ML_API_URL = normalizeUrl(process.env.ML_API_URL || DEFAULT_ML_API_URL);

function normalizeRole(role) {
  const value = String(role || '').trim().toUpperCase();
  if (value === 'ACCOUNT_MANAGER') return 'AM';
  return value;
}

function assertAdmin(user) {
  if (normalizeRole(user?.role) !== 'ADMIN') {
    const error = new Error('Administration access requires ADMIN role');
    error.status = 403;
    throw error;
  }
}

function validateUserPayload(payload, { requirePassword = false } = {}) {
  const role = normalizeRole(payload.role);
  const userName = String(payload.userName || payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '').trim();
  const activeFlag = payload.activeFlag === undefined ? true : Boolean(payload.activeFlag);
  const managerId = role === 'PM' && payload.managerId ? Number(payload.managerId) : null;

  if (!userName) {
    const error = new Error('User name is required');
    error.status = 400;
    throw error;
  }
  if (!email) {
    const error = new Error('Email is required');
    error.status = 400;
    throw error;
  }
  if (!ROLE_VALUES.includes(role)) {
    const error = new Error('Role must be ADMIN, AM, or PM');
    error.status = 400;
    throw error;
  }
  if (requirePassword && !password) {
    const error = new Error('Password is required');
    error.status = 400;
    throw error;
  }

  return {
    userName,
    email,
    password,
    role,
    managerId,
    activeFlag,
  };
}

async function assertValidManager(managerId) {
  if (!managerId) return;
  const manager = await userRepository.findById(managerId);
  if (!manager || !manager.activeFlag || !['AM', 'ACCOUNT_MANAGER'].includes(String(manager.role || '').toUpperCase())) {
    const error = new Error('Assigned Account Manager must be an active AM user');
    error.status = 400;
    throw error;
  }
}

async function listUsers(user) {
  assertAdmin(user);
  const [users, accountManagers] = await Promise.all([
    userRepository.listUsers(),
    userRepository.listActiveAccountManagers(),
  ]);
  return { items: users, accountManagers };
}

async function createUser(user, payload) {
  assertAdmin(user);
  const normalized = validateUserPayload(payload, { requirePassword: true });
  await assertValidManager(normalized.managerId);
  const passwordHash = await authService.hashPassword(normalized.password);
  return userRepository.createUser({ ...normalized, passwordHash });
}

async function updateUser(user, userId, payload) {
  assertAdmin(user);
  const existing = await userRepository.findById(userId);
  if (!existing) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  const normalized = validateUserPayload(payload);
  await assertValidManager(normalized.managerId);
  const passwordHash = normalized.password ? await authService.hashPassword(normalized.password) : null;
  return userRepository.updateUser(userId, { ...normalized, passwordHash });
}

async function getMlAdministration(user) {
  assertAdmin(user);
  const response = await axios.get(`${ML_API_URL}/admin/ml/status`, { timeout: 10000 });
  return response.data;
}

async function retrainMlModels(user) {
  assertAdmin(user);
  const response = await axios.post(`${ML_API_URL}/admin/ml/retrain`, {}, { timeout: 10000 });
  return response.data;
}

async function getMlTrainingJob(user, jobId) {
  assertAdmin(user);
  const response = await axios.get(`${ML_API_URL}/admin/ml/jobs/${encodeURIComponent(jobId)}`, { timeout: 10000 });
  return response.data;
}

const DATA_MANAGEMENT_PAGE_SIZE = 20;

async function query(sql, params = []) {
  const [rows] = await pool.promise().query(sql, params);
  return rows;
}

async function tableExists(tableName) {
  const rows = await query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1
    `,
    [tableName],
  );
  return rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await query(
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

async function addColumnIfMissing(tableName, columnName, ddl) {
  if (await tableExists(tableName) && !(await columnExists(tableName, columnName))) {
    await query(ddl);
  }
}

async function ensureDataManagementSchema() {
  await addColumnIfMissing(
    'project',
    'is_regression_data',
    'ALTER TABLE project ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0 AFTER approved_data',
  );
  await addColumnIfMissing(
    'project_drafts',
    'is_regression_data',
    'ALTER TABLE project_drafts ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0 AFTER published_at',
  );
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function listDataManagementProjects(user, params = {}) {
  assertAdmin(user);
  await ensureDataManagementSchema();

  const page = toPositiveInt(params.page, 1);
  const pageSize = Math.min(toPositiveInt(params.pageSize, DATA_MANAGEMENT_PAGE_SIZE), 100);
  const offset = (page - 1) * pageSize;
  const search = String(params.search || '').trim();
  const status = String(params.status || '').trim().toUpperCase();
  const managedProjectSql = `
    SELECT
      CONCAT('D', d.draft_id, '-', COALESCE(p.project_id, 'draft')) AS id,
      d.draft_id AS draftId,
      p.project_id AS projectId,
      COALESCE(p.project_code, CONCAT('DRF-', LPAD(d.draft_id, 6, '0'))) AS projectCode,
      COALESCE(p.project_name, JSON_UNQUOTE(JSON_EXTRACT(d.draft_data, '$.basicInfo.project_name')), 'Untitled Project') AS projectName,
      COALESCE(p.client_name, JSON_UNQUOTE(JSON_EXTRACT(d.draft_data, '$.basicInfo.client_name')), '-') AS clientName,
      COALESCE(d.workflow_status, d.status, 'DRAFT') AS status,
      creator.user_name AS createdBy,
      d.created_at AS createdDate,
      COALESCE(p.is_regression_data, d.is_regression_data, 0) AS isRegressionData
    FROM project_drafts d
    LEFT JOIN project p ON p.source_draft_id = d.draft_id
    LEFT JOIN app_user creator ON creator.user_id = d.owner_id
    UNION ALL
    SELECT
      CONCAT('P', p.project_id) AS id,
      NULL AS draftId,
      p.project_id AS projectId,
      COALESCE(p.project_code, CONCAT('PRJ-', LPAD(p.project_id, 6, '0'))) AS projectCode,
      COALESCE(p.project_name, 'Untitled Project') AS projectName,
      COALESCE(p.client_name, '-') AS clientName,
      'LEGACY' AS status,
      creator.user_name AS createdBy,
      p.created_at AS createdDate,
      COALESCE(p.is_regression_data, 0) AS isRegressionData
    FROM project p
    LEFT JOIN project_drafts d ON d.draft_id = p.source_draft_id
    LEFT JOIN app_user creator ON creator.user_id = p.owner_id
    WHERE d.draft_id IS NULL
  `;
  const where = ['isRegressionData = 0'];
  const values = [];

  if (search) {
    where.push(`(
      projectCode LIKE ?
      OR projectName LIKE ?
      OR clientName LIKE ?
      OR CAST(COALESCE(projectId, draftId) AS CHAR) LIKE ?
    )`);
    const term = `%${search}%`;
    values.push(term, term, term, term);
  }
  if (status) {
    where.push('status = ?');
    values.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      FROM (${managedProjectSql}) managed
      ${whereSql}
    `,
    values,
  );
  const rows = await query(
    `
      SELECT
        id, draftId, projectId, projectCode, projectName, clientName, status, createdBy, createdDate, isRegressionData
      FROM (${managedProjectSql}) managed
      ${whereSql}
      ORDER BY createdDate DESC, COALESCE(projectId, draftId) DESC
      LIMIT ? OFFSET ?
    `,
    [...values, pageSize, offset],
  );

  return {
    items: rows,
    pagination: {
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
    },
  };
}

async function resolveProjectReference(reference) {
  const draftId = Number(reference?.draftId || 0);
  const projectId = Number(reference?.projectId || 0);
  const filters = [];
  const params = [];
  if (draftId) {
    filters.push('d.draft_id = ?');
    params.push(draftId);
  }
  if (projectId) {
    filters.push('p.project_id = ?');
    params.push(projectId);
  }
  if (!filters.length) {
    const error = new Error('Project reference is required');
    error.status = 400;
    throw error;
  }
  await ensureDataManagementSchema();
  const rows = await query(
    `
      SELECT
        d.draft_id AS draftId,
        p.project_id AS projectId,
        COALESCE(p.project_code, CONCAT('DRF-', LPAD(d.draft_id, 6, '0'))) AS projectCode,
        COALESCE(p.project_name, JSON_UNQUOTE(JSON_EXTRACT(d.draft_data, '$.basicInfo.project_name')), 'Untitled Project') AS projectName,
        COALESCE(p.client_name, JSON_UNQUOTE(JSON_EXTRACT(d.draft_data, '$.basicInfo.client_name')), '-') AS clientName,
        COALESCE(d.workflow_status, d.status, 'DRAFT') AS status
      FROM project_drafts d
      LEFT JOIN project p ON p.source_draft_id = d.draft_id
      WHERE (${filters.join(' OR ')})
        AND COALESCE(p.is_regression_data, d.is_regression_data, 0) = 0
      LIMIT 1
    `,
    params,
  );
  if (!rows.length) {
    if (projectId) {
      const projectRows = await query(
        `
          SELECT
            d.draft_id AS draftId,
            p.project_id AS projectId,
            COALESCE(p.project_code, CONCAT('PRJ-', LPAD(p.project_id, 6, '0'))) AS projectCode,
            COALESCE(p.project_name, 'Untitled Project') AS projectName,
            COALESCE(p.client_name, '-') AS clientName,
            COALESCE(d.workflow_status, d.status, 'APPROVED') AS status
          FROM project p
          LEFT JOIN project_drafts d ON d.draft_id = p.source_draft_id
          WHERE p.project_id = ?
            AND COALESCE(p.is_regression_data, 0) = 0
          LIMIT 1
        `,
        [projectId],
      );
      if (projectRows.length) return projectRows[0];
    }
    const error = new Error('Project not found');
    error.status = 404;
    throw error;
  }
  return rows[0];
}

async function countIfExists(tableName, whereSql, params) {
  if (!(await tableExists(tableName))) return 0;
  const rows = await query(`SELECT COUNT(*) AS total FROM ${tableName} ${whereSql}`, params);
  return Number(rows[0]?.total || 0);
}

async function getProjectDeleteSummary(user, reference) {
  assertAdmin(user);
  const project = await resolveProjectReference(reference);
  const projectId = Number(project.projectId || 0);
  const draftId = Number(project.draftId || 0);
  const crRows = projectId ? await query('SELECT cr_id AS crId FROM change_request WHERE project_id = ?', [projectId]) : [];
  const crIds = crRows.map((row) => row.crId);
  const predictionRows = draftId ? await query('SELECT prediction_id AS predictionId FROM ml_prediction_log WHERE project_draft_id = ?', [draftId]) : [];
  const predictionIds = predictionRows.map((row) => row.predictionId);

  const counts = {
    project: projectId ? 1 : 0,
    draft: draftId ? 1 : 0,
    changeRequests: projectId ? await countIfExists('change_request', 'WHERE project_id = ?', [projectId]) : 0,
    crWorkflowHistory: crIds.length ? await countIfExists('cr_workflow_history', `WHERE cr_id IN (${crIds.map(() => '?').join(',')})`, crIds) : 0,
    progressSnapshots: projectId ? await countIfExists('project_progress_snapshot', 'WHERE project_id = ?', [projectId]) : 0,
    forecastSnapshots: projectId ? await countIfExists('project_forecast_snapshot', 'WHERE project_id = ?', [projectId]) : 0,
    projectWorkflowHistory: draftId ? await countIfExists('project_workflow_history', 'WHERE project_id = ?', [draftId]) : 0,
    completionHistory: projectId ? await countIfExists('project_completion_history', 'WHERE project_id = ?', [projectId]) : 0,
    completionResourceLoading: projectId ? await countIfExists('project_completion_resource_loading', 'WHERE project_id = ?', [projectId]) : 0,
    resourceAllocations: projectId ? await countIfExists('resource_allocation', 'WHERE project_id = ?', [projectId]) : 0,
    teamSnapshots: projectId ? await countIfExists('project_team_snapshot', 'WHERE project_id = ?', [projectId]) : 0,
    mlTargetVariables: projectId ? await countIfExists('ml_target_variable', 'WHERE project_id = ?', [projectId]) : 0,
    mlPredictionLogs: draftId ? await countIfExists('ml_prediction_log', 'WHERE project_draft_id = ?', [draftId]) : 0,
    mlPredictionFeedback: draftId ? await countIfExists('ml_prediction_feedback', 'WHERE project_draft_id = ?', [draftId]) : 0,
    mlPredictionFeedbackByPrediction: predictionIds.length
      ? await countIfExists('ml_prediction_feedback', `WHERE prediction_id IN (${predictionIds.map(() => '?').join(',')})`, predictionIds)
      : 0,
  };

  return {
    project,
    relatedRecords: counts,
    impactedTables: PROJECT_DELETE_TABLES,
  };
}

const PROJECT_DELETE_TABLES = [
  'ml_prediction_feedback',
  'ml_prediction_log',
  'cr_workflow_history',
  'change_request_resource_loading',
  'change_request_approval_history',
  'change_request',
  'project_progress_snapshot',
  'project_forecast_snapshot',
  'forecast_history',
  'project_completion_resource_loading',
  'project_completion_history',
  'project_team_snapshot',
  'project_resource_loading',
  'resource_allocation',
  'ml_target_variable',
  'approval_history',
  'workflow_history',
  'project_workflow_history',
  'project',
  'project_drafts',
];

async function deleteFromIfExists(connection, tableName, whereSql, params) {
  if (!(await tableExists(tableName))) return 0;
  try {
    const [result] = await connection.query(`DELETE FROM ${tableName} ${whereSql}`, params);
    return result.affectedRows || 0;
  } catch (error) {
    if (error.code === 'ER_BAD_FIELD_ERROR') return 0;
    throw error;
  }
}

async function deleteProjectTransactional(reference) {
  const project = await resolveProjectReference(reference);
  const projectId = Number(project.projectId || 0);
  const draftId = Number(project.draftId || 0);
  const connection = await pool.promise().getConnection();
  const deleted = {};

  try {
    await connection.beginTransaction();

    const [crRows] = projectId
      ? await connection.query('SELECT cr_id AS crId FROM change_request WHERE project_id = ?', [projectId])
      : [[]];
    const crIds = crRows.map((row) => row.crId);
    const [predictionRows] = draftId
      ? await connection.query('SELECT prediction_id AS predictionId FROM ml_prediction_log WHERE project_draft_id = ?', [draftId])
      : [[]];
    const predictionIds = predictionRows.map((row) => row.predictionId);

    if (predictionIds.length) {
      deleted.ml_prediction_feedback_by_prediction = await deleteFromIfExists(
        connection,
        'ml_prediction_feedback',
        `WHERE prediction_id IN (${predictionIds.map(() => '?').join(',')})`,
        predictionIds,
      );
    }
    if (draftId) {
      deleted.ml_prediction_feedback = await deleteFromIfExists(connection, 'ml_prediction_feedback', 'WHERE project_draft_id = ?', [draftId]);
      deleted.ml_prediction_log = await deleteFromIfExists(connection, 'ml_prediction_log', 'WHERE project_draft_id = ?', [draftId]);
    }
    if (crIds.length) {
      deleted.cr_workflow_history = await deleteFromIfExists(
        connection,
        'cr_workflow_history',
        `WHERE cr_id IN (${crIds.map(() => '?').join(',')})`,
        crIds,
      );
      deleted.change_request_resource_loading = await deleteFromIfExists(
        connection,
        'change_request_resource_loading',
        `WHERE cr_id IN (${crIds.map(() => '?').join(',')})`,
        crIds,
      );
      deleted.change_request_approval_history = await deleteFromIfExists(
        connection,
        'change_request_approval_history',
        `WHERE cr_id IN (${crIds.map(() => '?').join(',')})`,
        crIds,
      );
    }
    if (projectId) {
      deleted.change_request = await deleteFromIfExists(connection, 'change_request', 'WHERE project_id = ?', [projectId]);
      deleted.project_progress_snapshot = await deleteFromIfExists(connection, 'project_progress_snapshot', 'WHERE project_id = ?', [projectId]);
      deleted.project_forecast_snapshot = await deleteFromIfExists(connection, 'project_forecast_snapshot', 'WHERE project_id = ?', [projectId]);
      deleted.forecast_history = await deleteFromIfExists(connection, 'forecast_history', 'WHERE project_id = ?', [projectId]);
      deleted.project_completion_resource_loading = await deleteFromIfExists(connection, 'project_completion_resource_loading', 'WHERE project_id = ?', [projectId]);
      deleted.project_completion_history = await deleteFromIfExists(connection, 'project_completion_history', 'WHERE project_id = ?', [projectId]);
      deleted.project_team_snapshot = await deleteFromIfExists(connection, 'project_team_snapshot', 'WHERE project_id = ?', [projectId]);
      deleted.project_resource_loading = await deleteFromIfExists(connection, 'project_resource_loading', 'WHERE project_id = ?', [projectId]);
      deleted.resource_allocation = await deleteFromIfExists(connection, 'resource_allocation', 'WHERE project_id = ?', [projectId]);
      deleted.ml_target_variable = await deleteFromIfExists(connection, 'ml_target_variable', 'WHERE project_id = ?', [projectId]);
      deleted.approval_history_project = await deleteFromIfExists(connection, 'approval_history', 'WHERE project_id = ?', [projectId]);
      deleted.workflow_history_project = await deleteFromIfExists(connection, 'workflow_history', 'WHERE project_id = ?', [projectId]);
      deleted.project_workflow_history_project = await deleteFromIfExists(connection, 'project_workflow_history', 'WHERE project_id = ?', [projectId]);
      deleted.project = await deleteFromIfExists(connection, 'project', 'WHERE project_id = ?', [projectId]);
    }
    if (draftId) {
      deleted.approval_history_draft = await deleteFromIfExists(connection, 'approval_history', 'WHERE project_draft_id = ?', [draftId]);
      deleted.workflow_history_draft = await deleteFromIfExists(connection, 'workflow_history', 'WHERE project_draft_id = ?', [draftId]);
      deleted.project_workflow_history_draft = await deleteFromIfExists(connection, 'project_workflow_history', 'WHERE project_id = ?', [draftId]);
      deleted.project_drafts = await deleteFromIfExists(connection, 'project_drafts', 'WHERE draft_id = ?', [draftId]);
    }

    await connection.commit();
    return { project, deleted };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteProject(user, reference, confirmation) {
  assertAdmin(user);
  if (String(confirmation || '').trim() !== 'DELETE') {
    const error = new Error('Type DELETE to confirm project deletion');
    error.status = 400;
    throw error;
  }
  const result = await deleteProjectTransactional(reference);
  return {
    message: 'Project deleted successfully. All related records were removed.',
    ...result,
  };
}

async function bulkDeleteProjects(user, projects = [], confirmation) {
  assertAdmin(user);
  if (String(confirmation || '').trim() !== 'DELETE') {
    const error = new Error('Type DELETE to confirm project deletion');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(projects) || projects.length === 0) {
    const error = new Error('Select at least one project to delete');
    error.status = 400;
    throw error;
  }

  const results = [];
  for (const reference of projects) {
    results.push(await deleteProjectTransactional(reference));
  }
  return {
    message: 'Projects deleted successfully. All related records were removed.',
    deletedCount: results.length,
    results,
  };
}

module.exports = {
  bulkDeleteProjects,
  createUser,
  deleteProject,
  getProjectDeleteSummary,
  getMlAdministration,
  getMlTrainingJob,
  listDataManagementProjects,
  listUsers,
  normalizeRole,
  retrainMlModels,
  updateUser,
};
