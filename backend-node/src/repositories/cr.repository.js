const { pool } = require('../config/db.config');
const { ensureWorkflowSchema } = require('../workflow/workflow.service');
const projectRepository = require('./project.repository');

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
  return rows.length > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, columnDefinition) {
  if (!(await columnExists(connection, tableName, columnName))) {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

async function ensureCrSchema() {
  const connection = pool.promise();
  await projectRepository.ensureApprovedProjectTables(connection);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS change_request (
      cr_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (cr_id),
      INDEX idx_change_request_project_id (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await ensureWorkflowSchema('CR');
  await addColumnIfMissing(connection, 'change_request', 'cr_code', 'VARCHAR(32) NULL');
  await addColumnIfMissing(connection, 'change_request', 'cr_title', 'VARCHAR(255) NULL');
  await addColumnIfMissing(connection, 'change_request', 'cr_description', 'TEXT NULL');
  await addColumnIfMissing(connection, 'change_request', 'cr_category', 'VARCHAR(100) NULL');
  await addColumnIfMissing(connection, 'change_request', 'severity', 'VARCHAR(50) NULL');
  await addColumnIfMissing(connection, 'change_request', 'priority', 'VARCHAR(50) NULL');
  await addColumnIfMissing(connection, 'change_request', 'affected_module', 'VARCHAR(255) NULL');
  await addColumnIfMissing(connection, 'change_request', 'schedule_impact_days', 'DECIMAL(10,2) NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'change_request', 'estimated_effort_hours', 'DECIMAL(12,2) NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'change_request', 'estimated_cost_impact', 'DECIMAL(14,2) NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'change_request', 'dependency_impact', 'TEXT NULL');
  await addColumnIfMissing(connection, 'change_request', 'environments_affected', 'VARCHAR(255) NULL');
  await addColumnIfMissing(connection, 'change_request', 'additional_pm_count', 'DECIMAL(10,2) NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'change_request', 'additional_dev_count', 'DECIMAL(10,2) NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'change_request', 'additional_qa_count', 'DECIMAL(10,2) NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'change_request', 'additional_devops_count', 'DECIMAL(10,2) NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'change_request', 'additional_architect_count', 'DECIMAL(10,2) NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'change_request', 'additional_budget', 'DECIMAL(14,2) NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'change_request', 'additional_licensing_cost', 'DECIMAL(14,2) NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'change_request', 'infrastructure_cost_impact', 'DECIMAL(14,2) NULL DEFAULT 0');
  await addColumnIfMissing(connection, 'change_request', 'root_cause', 'TEXT NULL');

  await connection.query(`
    UPDATE change_request
    SET cr_code = CONCAT('CR-', LPAD(cr_id, 6, '0'))
    WHERE cr_code IS NULL OR cr_code = ''
  `);
}

const CR_SELECT = `
  cr.cr_id AS crId,
  cr.cr_id AS id,
  COALESCE(cr.cr_code, CONCAT('CR-', LPAD(cr.cr_id, 6, '0'))) AS crNumber,
  cr.project_id AS projectId,
  CONCAT('PRJ-', LPAD(cr.project_id, 6, '0')) AS projectCode,
  p.project_name AS projectName,
  cr.cr_title AS title,
  COALESCE(cr.cr_description, cr.root_cause) AS description,
  cr.cr_category AS category,
  cr.severity,
  cr.priority,
  cr.affected_module AS affectedModule,
  cr.schedule_impact_days AS scheduleImpactDays,
  cr.estimated_effort_hours AS estimatedEffortHours,
  cr.estimated_cost_impact AS estimatedCostImpact,
  cr.dependency_impact AS dependencyImpact,
  cr.environments_affected AS environmentsAffected,
  cr.additional_pm_count AS additionalPmCount,
  cr.additional_dev_count AS additionalDevCount,
  cr.additional_qa_count AS additionalQaCount,
  cr.additional_devops_count AS additionalDevOpsCount,
  cr.additional_architect_count AS additionalArchitectCount,
  cr.additional_budget AS additionalBudget,
  cr.additional_licensing_cost AS additionalLicensingCost,
  cr.infrastructure_cost_impact AS infrastructureCostImpact,
  cr.status,
  cr.workflow_status AS workflowStatus,
  cr.submitted_by_user_id AS submittedByUserId,
  cr.approved_by_user_id AS approvedByUserId,
  cr.submitted_at AS submittedAt,
  cr.approved_at AS approvedAt,
  cr.latest_comment AS latestComment,
  cr.created_at AS createdAt,
  cr.updated_at AS updatedAt
`;

const writableColumns = `
  project_id = ?,
  cr_title = ?,
  cr_description = ?,
  root_cause = ?,
  cr_category = ?,
  severity = ?,
  priority = ?,
  affected_module = ?,
  schedule_impact_days = ?,
  estimated_effort_hours = ?,
  estimated_cost_impact = ?,
  dependency_impact = ?,
  environments_affected = ?,
  additional_pm_count = ?,
  additional_dev_count = ?,
  additional_qa_count = ?,
  additional_devops_count = ?,
  additional_architect_count = ?,
  additional_budget = ?,
  additional_licensing_cost = ?,
  infrastructure_cost_impact = ?
`;

function payloadValues(crData) {
  return [
    crData.projectId,
    crData.title,
    crData.description,
    crData.description,
    crData.category,
    crData.severity,
    crData.priority,
    crData.affectedModule,
    crData.scheduleImpactDays,
    crData.estimatedEffortHours,
    crData.estimatedCostImpact,
    crData.dependencyImpact,
    crData.environmentsAffected,
    crData.additionalPmCount,
    crData.additionalDevCount,
    crData.additionalQaCount,
    crData.additionalDevOpsCount,
    crData.additionalArchitectCount,
    crData.additionalBudget,
    crData.additionalLicensingCost,
    crData.infrastructureCostImpact,
  ];
}

async function createDraft(crData, createdBy) {
  await ensureCrSchema();
  const [result] = await pool.promise().query(
    `
      INSERT INTO change_request
      SET ${writableColumns},
          status = 'DRAFT',
          workflow_status = 'DRAFT',
          submitted_by_user_id = ?
    `,
    [...payloadValues(crData), createdBy],
  );

  await pool.promise().query(
    "UPDATE change_request SET cr_code = CONCAT('CR-', LPAD(cr_id, 6, '0')) WHERE cr_id = ?",
    [result.insertId],
  );

  return { crId: result.insertId };
}

async function updateDraft(crId, crData) {
  await ensureCrSchema();
  const [result] = await pool.promise().query(
    `
      UPDATE change_request
      SET ${writableColumns}, updated_at = NOW()
      WHERE cr_id = ? AND workflow_status IN ('DRAFT', 'RETURNED')
    `,
    [...payloadValues(crData), crId],
  );
  return result.affectedRows > 0;
}

async function getChangeRequestById(crId) {
  await ensureCrSchema();
  const [rows] = await pool.promise().query(
    `
      SELECT ${CR_SELECT}
      FROM change_request cr
      INNER JOIN project p ON p.project_id = cr.project_id
      WHERE cr.cr_id = ?
      LIMIT 1
    `,
    [crId],
  );

  return rows[0] || null;
}

async function getChangeRequestsByProject(projectId) {
  await ensureCrSchema();
  const [rows] = await pool.promise().query(
    `
      SELECT ${CR_SELECT}
      FROM change_request cr
      INNER JOIN project p ON p.project_id = cr.project_id
      WHERE cr.project_id = ?
      ORDER BY cr.updated_at DESC, cr.cr_id DESC
    `,
    [projectId],
  );

  return rows;
}

const CR_SORT_COLUMNS = {
  createdAt: 'cr.created_at',
  createdDate: 'cr.created_at',
  updatedAt: 'cr.updated_at',
  updatedDate: 'cr.updated_at',
  projectName: 'p.project_name',
  status: 'cr.workflow_status',
  severity: 'cr.severity',
  priority: 'cr.priority',
  scheduleImpactDays: 'cr.schedule_impact_days',
  estimatedCostImpact: 'cr.estimated_cost_impact',
};

function buildCrListWhere(filters) {
  const actorRole = String(filters.role || '').toUpperCase();
  const where = [];
  const params = [];

  if (actorRole === 'ACCOUNT_MANAGER') {
    where.push("(cr.workflow_status = 'SUBMITTED' OR (cr.workflow_status = 'APPROVED' AND cr.approved_by_user_id = ?))");
    params.push(filters.userId);
  } else {
    where.push('cr.submitted_by_user_id = ?');
    params.push(filters.userId);
  }

  if (filters.search) {
    where.push(`(
      COALESCE(cr.cr_code, CONCAT('CR-', LPAD(cr.cr_id, 6, '0'))) LIKE ?
      OR CAST(cr.cr_id AS CHAR) LIKE ?
      OR cr.cr_title LIKE ?
      OR p.project_name LIKE ?
    )`);
    const searchValue = `%${filters.search}%`;
    params.push(searchValue, searchValue, searchValue, searchValue);
  }

  if (filters.status) {
    where.push('cr.workflow_status = ?');
    params.push(filters.status);
  }

  if (filters.severity) {
    where.push("COALESCE(cr.severity, '') = ?");
    params.push(filters.severity);
  }

  if (filters.category) {
    where.push("COALESCE(cr.cr_category, '') = ?");
    params.push(filters.category);
  }

  if (filters.createdFrom) {
    where.push('DATE(cr.created_at) >= ?');
    params.push(filters.createdFrom);
  }

  if (filters.createdTo) {
    where.push('DATE(cr.created_at) <= ?');
    params.push(filters.createdTo);
  }

  return {
    sql: where.join(' AND '),
    params,
  };
}

function mapCrListRow(row) {
  return {
    crId: row.crId,
    id: row.crId,
    crNumber: row.crNumber,
    projectId: row.projectId,
    projectName: row.projectName || '-',
    category: row.category || '-',
    severity: row.severity || '-',
    priority: row.priority || '-',
    currentStatus: row.currentStatus || 'DRAFT',
    scheduleImpactDays: row.scheduleImpactDays ?? 0,
    estimatedCostImpact: row.estimatedCostImpact ?? 0,
    latestComment: row.latestComment || '-',
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    canEdit: ['DRAFT', 'RETURNED'].includes(row.currentStatus),
  };
}

async function findCrsForPm(filters) {
  await ensureCrSchema();
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 10));
  const offset = (page - 1) * pageSize;
  const sortColumn = CR_SORT_COLUMNS[filters.sortBy] || CR_SORT_COLUMNS.updatedAt;
  const sortOrder = String(filters.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const where = buildCrListWhere(filters);

  const [countRows] = await pool.promise().query(
    `
      SELECT COUNT(*) AS totalRecords
      FROM change_request cr
      INNER JOIN project p ON p.project_id = cr.project_id
      WHERE ${where.sql}
    `,
    where.params,
  );

  const [rows] = await pool.promise().query(
    `
      SELECT cr.cr_id AS crId,
             COALESCE(cr.cr_code, CONCAT('CR-', LPAD(cr.cr_id, 6, '0'))) AS crNumber,
             cr.project_id AS projectId,
             p.project_name AS projectName,
             cr.cr_category AS category,
             cr.severity,
             cr.priority,
             cr.workflow_status AS currentStatus,
             cr.schedule_impact_days AS scheduleImpactDays,
             cr.estimated_cost_impact AS estimatedCostImpact,
             cr.latest_comment AS latestComment,
             cr.created_at AS createdAt,
             cr.updated_at AS updatedAt
      FROM change_request cr
      INNER JOIN project p ON p.project_id = cr.project_id
      WHERE ${where.sql}
      ORDER BY ${sortColumn} ${sortOrder}, cr.cr_id DESC
      LIMIT ? OFFSET ?
    `,
    [...where.params, pageSize, offset],
  );

  const totalRecords = Number(countRows[0]?.totalRecords || 0);
  return {
    items: rows.map(mapCrListRow),
    page,
    pageSize,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
  };
}

async function countByProject(projectId) {
  await ensureCrSchema();
  const [rows] = await pool.promise().query(
    'SELECT COUNT(*) AS crCount FROM change_request WHERE project_id = ?',
    [projectId],
  );
  return rows[0].crCount;
}

module.exports = {
  countByProject,
  createDraft,
  ensureCrSchema,
  findCrsForPm,
  getChangeRequestById,
  getChangeRequestsByProject,
  updateDraft,
};
