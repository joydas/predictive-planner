const { pool } = require('../config/db.config');

async function ensureCrSchema() {
  const projectRepository = require('./project.repository');
  await projectRepository.ensureApprovedProjectTables();
  await addColumnIfMissing('change_request', 'is_regression_data', `
    ALTER TABLE change_request
    ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0
  `);
  await addColumnIfMissing('change_request', 'cr_staffing_baseline_snapshot', `
    ALTER TABLE change_request
    ADD COLUMN cr_staffing_baseline_snapshot JSON NULL AFTER infrastructure_cost_impact
  `);
  await addColumnIfMissing('change_request', 'cr_staffing_delta', `
    ALTER TABLE change_request
    ADD COLUMN cr_staffing_delta JSON NULL AFTER cr_staffing_baseline_snapshot
  `);
  return true;
}

async function addColumnIfMissing(tableName, columnName, alterSql) {
  const [columns] = await pool.promise().query(
    `
      SELECT COLUMN_NAME AS columnName
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );

  if (columns.length) {
    return false;
  }
  await pool.promise().query(alterSql);
  return true;
}

const CR_SELECT = `
  cr.cr_id AS crId,
  cr.cr_id AS id,
  COALESCE(cr.cr_code, CONCAT('CR-', LPAD(cr.cr_id, 6, '0'))) AS crNumber,
  cr.project_id AS projectId,
  CONCAT('PRJ-', LPAD(cr.project_id, 6, '0')) AS projectCode,
  p.project_name AS projectName,
  pd.workflow_status AS projectWorkflowStatus,
  cr.cr_title AS title,
  COALESCE(cr.cr_description, cr.root_cause) AS description,
  cr.cr_category AS category,
  cr.severity,
  cr.priority,
  cr.affected_module AS affectedModule,
  cr.schedule_impact_days AS scheduleImpactDays,
  cr.estimated_effort_hours AS estimatedEffortHours,
  cr.estimated_cost_impact AS estimatedCostImpact,
  cr.effort_impact AS effortImpact,
  cr.budget_impact AS budgetImpact,
  cr.team_size_impact AS teamSizeImpact,
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
  cr.cr_staffing_baseline_snapshot AS staffingBaselineSnapshot,
  cr.cr_staffing_delta AS staffingDeltas,
  cr.status,
  cr.workflow_status AS workflowStatus,
  cr.submitted_by_user_id AS submittedByUserId,
  submitter.manager_id AS submittedByManagerId,
  cr.approved_by_user_id AS approvedByUserId,
  COALESCE(cr.is_regression_data, 0) AS isRegressionData,
  COALESCE(p.is_regression_data, 0) AS projectIsRegressionData,
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
  effort_impact = ?,
  budget_impact = ?,
  team_size_impact = ?,
  dependency_impact = ?,
  environments_affected = ?,
  additional_pm_count = ?,
  additional_dev_count = ?,
  additional_qa_count = ?,
  additional_devops_count = ?,
  additional_architect_count = ?,
  additional_budget = ?,
  additional_licensing_cost = ?,
  infrastructure_cost_impact = ?,
  cr_staffing_baseline_snapshot = ?,
  cr_staffing_delta = ?
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
    crData.effortImpact,
    crData.budgetImpact,
    crData.teamSizeImpact,
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
    JSON.stringify(crData.staffingBaselineSnapshot || []),
    JSON.stringify(crData.staffingDeltas || []),
  ];
}

function parseJson(rawValue, fallback) {
  if (!rawValue) return fallback;
  if (typeof rawValue === 'object') return rawValue;
  try {
    return JSON.parse(rawValue);
  } catch {
    return fallback;
  }
}

function normalizeStaffingRow(row = {}, fallbackKey = '') {
  const roleId = row.roleId ?? row.role_id ?? null;
  const role = row.role || row.roleName || '';
  const locationType = row.locationType || row.location_type || 'ONSITE';
  const count = Number(row.count ?? row.resourceCount ?? row.resource_count ?? 0) || 0;
  const allocationPercent = Number(row.allocationPercent ?? row.allocation_percent ?? 0) || 0;
  const plannedEffort = Number(row.plannedEffort ?? row.planned_effort ?? 0) || 0;
  const plannedCost = Number(row.plannedCost ?? row.planned_cost ?? 0) || 0;
  const ratePerDay = Number(row.ratePerDay ?? row.rate_per_day ?? 0) || 0;
  const key = row.key || row.baselineKey || [
    roleId || role || fallbackKey,
    locationType,
    row.startDate || row.allocationStartDate || row.allocation_start_date || '',
    row.endDate || row.allocationEndDate || row.allocation_end_date || '',
  ].join('|');

  return {
    key,
    roleId,
    role,
    locationType,
    count,
    allocationPercent,
    startDate: row.startDate || row.allocationStartDate || row.allocation_start_date || '',
    endDate: row.endDate || row.allocationEndDate || row.allocation_end_date || '',
    ratePerDay,
    durationDays: Number(row.durationDays ?? row.workingDays ?? 0) || 0,
    plannedEffort,
    plannedCost,
  };
}

function applyStaffingDeltas(baselineRows = [], deltas = []) {
  const rowMap = new Map();
  baselineRows.forEach((row, index) => {
    const normalized = normalizeStaffingRow(row, `baseline-${index}`);
    rowMap.set(normalized.key, normalized);
  });

  deltas.forEach((delta, index) => {
    const normalizedDelta = normalizeStaffingRow(delta, `delta-${index}`);
    const key = delta.baselineKey || normalizedDelta.key;
    const existing = rowMap.get(key);
    if (existing) {
      rowMap.set(key, {
        ...existing,
        count: existing.count + normalizedDelta.count,
        allocationPercent: existing.allocationPercent + normalizedDelta.allocationPercent,
        startDate: normalizedDelta.startDate || existing.startDate,
        endDate: normalizedDelta.endDate || existing.endDate,
        durationDays: existing.durationDays + normalizedDelta.durationDays,
        plannedEffort: existing.plannedEffort + normalizedDelta.plannedEffort,
        plannedCost: existing.plannedCost + normalizedDelta.plannedCost,
      });
    } else {
      rowMap.set(key, {
        ...normalizedDelta,
        key,
      });
    }
  });

  return Array.from(rowMap.values())
    .filter((row) => Math.abs(Number(row.count || 0)) > 0.0001 || Math.abs(Number(row.plannedEffort || 0)) > 0.0001)
    .map((row) => ({
      ...row,
      count: Number(row.count.toFixed(2)),
      allocationPercent: Number(row.allocationPercent.toFixed(2)),
      durationDays: Number(row.durationDays.toFixed(2)),
      plannedEffort: Number(row.plannedEffort.toFixed(2)),
      plannedCost: Number(row.plannedCost.toFixed(2)),
    }));
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
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
      LEFT JOIN app_user submitter ON submitter.user_id = cr.submitted_by_user_id
      WHERE cr.cr_id = ?
      LIMIT 1
    `,
    [crId],
  );

  if (!rows[0]) return null;
  return {
    ...rows[0],
    staffingBaselineSnapshot: parseJson(rows[0].staffingBaselineSnapshot, []),
    staffingDeltas: parseJson(rows[0].staffingDeltas, []),
  };
}

async function getChangeRequestForUpdate(connection, crId) {
  const [rows] = await connection.query(
    `
      SELECT ${CR_SELECT}
      FROM change_request cr
      INNER JOIN project p ON p.project_id = cr.project_id
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
      LEFT JOIN app_user submitter ON submitter.user_id = cr.submitted_by_user_id
      WHERE cr.cr_id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [crId],
  );

  if (!rows[0]) return null;
  return {
    ...rows[0],
    staffingBaselineSnapshot: parseJson(rows[0].staffingBaselineSnapshot, []),
    staffingDeltas: parseJson(rows[0].staffingDeltas, []),
  };
}

async function getProjectBaseStaffingSnapshot(projectId) {
  await ensureCrSchema();
  const [rows] = await pool.promise().query(
    `
      SELECT team_snapshot_id AS snapshotId,
             role_id AS roleId,
             role,
             location_type AS locationType,
             resource_count AS count,
             allocation_percent AS allocationPercent,
             allocation_start_date AS startDate,
             allocation_end_date AS endDate,
             rate_per_day AS ratePerDay,
             planned_effort AS plannedEffort,
             planned_cost AS plannedCost
      FROM project_team_snapshot
      WHERE project_id = ?
      ORDER BY team_snapshot_id
    `,
    [projectId],
  );
  return rows.map((row, index) => normalizeStaffingRow({
    ...row,
    key: `snapshot-${row.snapshotId || index}`,
  }, `snapshot-${index}`));
}

async function getApprovedStaffingDeltas(projectId, excludeCrId = null) {
  await ensureCrSchema();
  const params = [projectId];
  let excludeSql = '';
  if (excludeCrId) {
    excludeSql = 'AND cr_id <> ?';
    params.push(excludeCrId);
  }

  const [rows] = await pool.promise().query(
    `
      SELECT cr_staffing_delta AS staffingDeltas
      FROM change_request
      WHERE project_id = ?
        AND workflow_status = 'APPROVED'
        ${excludeSql}
      ORDER BY approved_at ASC, cr_id ASC
    `,
    params,
  );

  return rows.flatMap((row) => parseJson(row.staffingDeltas, []));
}

async function getCurrentApprovedStaffing(projectId, excludeCrId = null) {
  const baseSnapshot = await getProjectBaseStaffingSnapshot(projectId);
  const approvedDeltas = await getApprovedStaffingDeltas(projectId, excludeCrId);
  const currentSnapshot = applyStaffingDeltas(baseSnapshot, approvedDeltas);
  return {
    originalBaseline: baseSnapshot,
    approvedDeltas,
    currentApprovedStaffing: currentSnapshot,
    totals: currentSnapshot.reduce((totals, row) => ({
      effort: totals.effort + Number(row.plannedEffort || 0),
      cost: totals.cost + Number(row.plannedCost || 0),
      teamSize: totals.teamSize + Number(row.count || 0),
    }), { effort: 0, cost: 0, teamSize: 0 }),
  };
}

async function accumulateApprovedCrImpact(connection, changeRequest) {
  const effortImpact = Number(changeRequest.effortImpact);
  const budgetImpact = Number(changeRequest.budgetImpact);
  const teamSizeImpact = Number(changeRequest.teamSizeImpact);
  const estimationImpact = Number(changeRequest.estimatedEffortHours ?? changeRequest.effortImpact ?? 0);
  const [result] = await connection.query(
    `
      UPDATE project p
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
      SET p.current_planned_effort = COALESCE(p.current_planned_effort, 0) + ?,
          p.current_planned_budget = COALESCE(p.current_planned_budget, 0) + ?,
          p.current_planned_team_size = COALESCE(p.current_planned_team_size, 0) + ?,
          p.total_cr_effort_impact = COALESCE(p.total_cr_effort_impact, 0) + ?,
          p.total_cr_budget_impact = COALESCE(p.total_cr_budget_impact, 0) + ?,
          p.total_cr_team_impact = COALESCE(p.total_cr_team_impact, 0) + ?,
          p.actual_final_estimated_value = COALESCE(p.actual_final_estimated_value, p.pm_estimated_value, 0) + ?,
          p.total_cr_estimation_impact = COALESCE(p.total_cr_estimation_impact, 0) + ?
      WHERE p.project_id = ?
        AND pd.workflow_status = 'APPROVED'
    `,
    [
      effortImpact,
      budgetImpact,
      teamSizeImpact,
      effortImpact,
      budgetImpact,
      teamSizeImpact,
      estimationImpact,
      estimationImpact,
      changeRequest.projectId,
    ],
  );
  return result.affectedRows > 0;
}

async function getChangeRequestsByProject(projectId) {
  await ensureCrSchema();
  const [rows] = await pool.promise().query(
    `
      SELECT ${CR_SELECT}
      FROM change_request cr
      INNER JOIN project p ON p.project_id = cr.project_id
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
      LEFT JOIN app_user submitter ON submitter.user_id = cr.submitted_by_user_id
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
  additionalBudget: 'cr.additional_budget',
  budgetImpact: 'cr.budget_impact',
};

function buildCrListWhere(filters) {
  const rawRole = String(filters.role || '').toUpperCase();
  const actorRole = rawRole === 'AM' ? 'ACCOUNT_MANAGER' : rawRole;
  const where = [];
  const params = [];

  if (actorRole === 'ACCOUNT_MANAGER') {
    where.push(`(
      EXISTS (
        SELECT 1
        FROM app_user assigned_pm
        WHERE assigned_pm.user_id = cr.submitted_by_user_id
          AND assigned_pm.manager_id = ?
      )
      OR cr.approved_by_user_id = ?
    )`);
    params.push(filters.userId, filters.userId);
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

  where.push('COALESCE(cr.is_regression_data, 0) = 0');
  where.push('COALESCE(p.is_regression_data, 0) = 0');

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
    additionalBudget: row.additionalBudget ?? row.budgetImpact ?? row.estimatedCostImpact ?? 0,
    budgetImpact: row.budgetImpact ?? row.additionalBudget ?? row.estimatedCostImpact ?? 0,
    latestComment: row.latestComment || '-',
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    canEdit: ['DRAFT', 'RETURNED'].includes(row.currentStatus)
      && String(row.projectWorkflowStatus || '').toUpperCase() !== 'COMPLETE',
    projectWorkflowStatus: row.projectWorkflowStatus,
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
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
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
             pd.workflow_status AS projectWorkflowStatus,
             cr.cr_category AS category,
             cr.severity,
             cr.priority,
             cr.workflow_status AS currentStatus,
             cr.schedule_impact_days AS scheduleImpactDays,
             cr.estimated_cost_impact AS estimatedCostImpact,
             cr.additional_budget AS additionalBudget,
             cr.budget_impact AS budgetImpact,
             cr.latest_comment AS latestComment,
             cr.created_at AS createdAt,
             cr.updated_at AS updatedAt
      FROM change_request cr
      INNER JOIN project p ON p.project_id = cr.project_id
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
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
  applyStaffingDeltas,
  countByProject,
  createDraft,
  ensureCrSchema,
  findCrsForPm,
  accumulateApprovedCrImpact,
  getCurrentApprovedStaffing,
  getChangeRequestById,
  getChangeRequestForUpdate,
  getChangeRequestsByProject,
  updateDraft,
};
