const authService = require('./auth.service');
const userRepository = require('../repositories/user.repository');
const axios = require('axios');
const notificationService = require('./notification.service');
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
  const role = normalizeRole(user?.role);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    const error = new Error('Administration access requires ADMIN or SUPER_ADMIN role');
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

async function assertValidManager(managerId, organizationId) {
  if (!managerId) return;
  const manager = await userRepository.findById(managerId, organizationId);
  if (!manager || !manager.activeFlag || !['AM', 'ACCOUNT_MANAGER'].includes(String(manager.role || '').toUpperCase())) {
    const error = new Error('Assigned Account Manager must be an active AM user within the same organization');
    error.status = 400;
    throw error;
  }
}

async function listUsers(user) {
  assertAdmin(user);
  const organizationId = user.organizationId;
  const [users, accountManagers] = await Promise.all([
    userRepository.listUsers(organizationId),
    userRepository.listActiveAccountManagers(organizationId),
  ]);
  return { items: users, accountManagers };
}

async function createUser(user, payload) {
  assertAdmin(user);
  const organizationId = user.organizationId;
  const normalized = validateUserPayload(payload, { requirePassword: true });
  await assertValidManager(normalized.managerId, organizationId);
  const passwordHash = await authService.hashPassword(normalized.password);
  return userRepository.createUser({ ...normalized, organizationId, passwordHash });
}

async function updateUser(user, userId, payload) {
  assertAdmin(user);
  const organizationId = user.organizationId;
  const existing = await userRepository.findById(userId, organizationId);
  if (!existing) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  const normalized = validateUserPayload(payload);
  await assertValidManager(normalized.managerId, organizationId);
  const passwordHash = normalized.password ? await authService.hashPassword(normalized.password) : null;
  return userRepository.updateUser(userId, organizationId, { ...normalized, passwordHash });
}

async function getMlAdministration(user) {
  assertAdmin(user);
  const response = await axios.get(`${ML_API_URL}/admin/ml/status`, { timeout: 10000 });
  return response.data;
}

async function retrainMlModels(user) {
  assertAdmin(user);
  const response = await axios.post(`${ML_API_URL}/admin/ml/retrain`, {
    userId: user.userId,
    organizationId: user.organizationId
  }, { timeout: 10000 });
  
  // Notification
  await notificationService.notifyModelEvent(user.organizationId, user.userId, 'RETRAIN_STARTED', 'ML Retraining Started', 'A new ML model retraining job has been initiated.');
  
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


function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function listDataManagementProjects(user, params = {}) {
  assertAdmin(user);

  const page = toPositiveInt(params.page, 1);
  const pageSize = Math.min(toPositiveInt(params.pageSize, DATA_MANAGEMENT_PAGE_SIZE), 100);
  const offset = (page - 1) * pageSize;
  const search = String(params.search || '').trim();
  const status = String(params.status || '').trim().toUpperCase();
  const includeRegressionData = ['1', 'true', 'yes', 'on'].includes(String(params.includeRegressionData || '').toLowerCase());
  const role = normalizeRole(user.role);
  const orgFilter = role === 'ADMIN' ? 'd.organization_id = ?' : '1=1';
  const orgFilterP = role === 'ADMIN' ? 'p.organization_id = ?' : '1=1';
  const managedProjectSql = `
    SELECT
      CONCAT('P', p.project_id) AS id,
      NULL AS draftId,
      p.project_id AS projectId,
      COALESCE(p.project_code, CONCAT('PRJ-', LPAD(p.project_id, 6, '0'))) AS projectCode,
      COALESCE(p.project_name, 'Untitled Project') AS projectName,
      COALESCE(p.client_name, '-') AS clientName,
      COALESCE(p.workflow_status, p.status, 'LEGACY') AS status,
      creator.user_name AS createdBy,
      p.created_at AS createdDate,
      COALESCE(p.is_regression_data, 0) AS isRegressionData
    FROM project p
    LEFT JOIN app_user creator ON creator.user_id = p.owner_id
    WHERE ${orgFilterP}
  `;
  const where = includeRegressionData ? [] : ['isRegressionData = 0'];
  const baseValues = role === 'ADMIN' ? [user.organizationId] : [];
  const values = [...baseValues];

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
      includeRegressionData,
    },
  };
}

async function resolveProjectReference(user, reference) {
  const role = normalizeRole(user.role);
  const organizationId = user.organizationId;
  const orgFilterP = role === 'ADMIN' ? ' AND p.organization_id = ?' : '';
  const projectId = Number(reference?.projectId || 0);
  if (!projectId) {
    const error = new Error('Project reference is required');
    error.status = 400;
    throw error;
  }
  const rows = await query(
    `
      SELECT
        NULL AS draftId,
        p.project_id AS projectId,
        COALESCE(p.project_code, CONCAT('PRJ-', LPAD(p.project_id, 6, '0'))) AS projectCode,
        COALESCE(p.project_name, 'Untitled Project') AS projectName,
        COALESCE(p.client_name, '-') AS clientName,
        COALESCE(p.workflow_status, p.status, 'APPROVED') AS status
      FROM project p
      WHERE p.project_id = ?${orgFilterP}
      LIMIT 1
    `,
    role === 'ADMIN' ? [projectId, organizationId] : [projectId],
  );
  if (!rows.length) {
    const error = new Error('Project not found');
    error.status = 404;
    throw error;
  }
  return rows[0];
}

async function countRows(tableName, whereSql, params) {
  const rows = await query(`SELECT COUNT(*) AS total FROM ${tableName} ${whereSql}`, params);
  return Number(rows[0]?.total || 0);
}

function uniqueNumbers(values) {
  return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))];
}

function inClause(values) {
  return values.map(() => '?').join(',');
}

async function resolveProjectIdsForDelete(project) {
  const projectId = Number(project.projectId || 0);
  return uniqueNumbers([projectId]);
}

async function countByProjectIds(tableName, projectIds, extraWhere = '') {
  if (!projectIds.length) return 0;
  return countRows(tableName, `WHERE project_id IN (${inClause(projectIds)}) ${extraWhere}`, projectIds);
}

async function getProjectDeleteSummary(user, reference) {
  assertAdmin(user);
  const project = await resolveProjectReference(user, reference);
  const projectId = Number(project.projectId || 0);
  const projectIds = await resolveProjectIdsForDelete(project);
  const crRows = projectIds.length ? await query(`SELECT cr_id AS crId FROM change_request WHERE project_id IN (${inClause(projectIds)})`, projectIds) : [];
  const crIds = crRows.map((row) => row.crId);

  const counts = {
    project: projectIds.length,
    changeRequests: await countByProjectIds('change_request', projectIds),
    crWorkflowHistory: crIds.length ? await countRows('cr_workflow_history', `WHERE cr_id IN (${crIds.map(() => '?').join(',')})`, crIds) : 0,
    progressSnapshots: await countByProjectIds('project_progress_snapshot', projectIds),
    forecastSnapshots: await countByProjectIds('project_forecast_snapshot', projectIds),
    projectWorkflowHistory: await countByProjectIds('project_workflow_history', projectIds),
    completionHistory: await countByProjectIds('project_completion_history', projectIds),
    completionResourceLoading: await countByProjectIds('project_completion_resource_loading', projectIds),
    resourceAllocations: await countByProjectIds('resource_allocation', projectIds),
    teamSnapshots: await countByProjectIds('project_team_snapshot', projectIds),
    mlTargetVariables: await countByProjectIds('ml_target_variable', projectIds),
  };

  return {
    project,
    relatedRecords: counts,
    impactedTables: PROJECT_DELETE_TABLES,
  };
}

const PROJECT_DELETE_TABLES = [
  'ml_prediction_feedback',
  'pl_prediction_feedback',
  'ml_prediction_log',
  'cr_workflow_history',
  // 'change_request_resource_loading',
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
];

async function deleteFromTable(connection, tableName, whereSql, params) {
  const [result] = await connection.query(`DELETE FROM ${tableName} ${whereSql}`, params);
  return result.affectedRows || 0;
}

async function deleteByProjectIds(connection, tableName, projectIds) {
  if (!projectIds.length) return 0;
  return deleteFromTable(connection, tableName, `WHERE project_id IN (${inClause(projectIds)})`, projectIds);
}

async function deleteProjectTransactional(user, reference) {
  const project = await resolveProjectReference(user, reference);
  const projectId = Number(project.projectId || 0);
  const connection = await pool.promise().getConnection();
  const deleted = {};

  try {
    await connection.beginTransaction();

    const projectIds = uniqueNumbers([
      projectId,
    ]);
    const [crRows] = projectIds.length
      ? await connection.query(`SELECT cr_id AS crId FROM change_request WHERE project_id IN (${inClause(projectIds)})`, projectIds)
      : [[]];
    const crIds = crRows.map((row) => row.crId);
    if (crIds.length) {
      deleted.cr_workflow_history = await deleteFromTable(
        connection,
        'cr_workflow_history',
        `WHERE cr_id IN (${crIds.map(() => '?').join(',')})`,
        crIds,
      );
      // deleted.change_request_resource_loading = await deleteFromTable(
      //   connection,
      //   'change_request_resource_loading',
      //   `WHERE cr_id IN (${crIds.map(() => '?').join(',')})`,
      //   crIds,
      // );
      // deleted.change_request_approval_history = await deleteFromTable(
      //   connection,
      //   'change_request_approval_history',
      //   `WHERE cr_id IN (${crIds.map(() => '?').join(',')})`,
      //   crIds,
      // );
    }
    if (projectIds.length) {
      deleted.change_request = await deleteByProjectIds(connection, 'change_request', projectIds);
      deleted.project_progress_snapshot = await deleteByProjectIds(connection, 'project_progress_snapshot', projectIds);
      deleted.project_forecast_snapshot = await deleteByProjectIds(connection, 'project_forecast_snapshot', projectIds);
      //deleted.forecast_history = await deleteByProjectIds(connection, 'forecast_history', projectIds);
      deleted.project_completion_resource_loading = await deleteByProjectIds(connection, 'project_completion_resource_loading', projectIds);
      deleted.project_completion_history = await deleteByProjectIds(connection, 'project_completion_history', projectIds);
      deleted.project_team_snapshot = await deleteByProjectIds(connection, 'project_team_snapshot', projectIds);
      //deleted.project_resource_loading = await deleteByProjectIds(connection, 'project_resource_loading', projectIds);
      deleted.resource_allocation = await deleteByProjectIds(connection, 'resource_allocation', projectIds);
      deleted.ml_target_variable = await deleteByProjectIds(connection, 'ml_target_variable', projectIds);
      //deleted.approval_history_project = await deleteByProjectIds(connection, 'approval_history', projectIds);
      deleted.workflow_history_project = await deleteByProjectIds(connection, 'project_workflow_history', projectIds);
      deleted.project = await deleteFromTable(connection, 'project', `WHERE project_id IN (${inClause(projectIds)})`, projectIds);
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
  const result = await deleteProjectTransactional(user, reference);
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
    results.push(await deleteProjectTransactional(user, reference));
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
