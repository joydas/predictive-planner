const { pool: db } = require('../config/db.config');

async function ensureDraftTable() {
  await addColumnIfMissing('project_drafts', 'is_regression_data', `
    ALTER TABLE project_drafts
    ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0 AFTER published_at
  `);
  return true;
}

async function ensureApprovedProjectTables() {
  await addColumnIfMissing('project', 'industry_code', `
    ALTER TABLE project
    ADD COLUMN industry_code VARCHAR(50) NULL AFTER industry,
    ADD INDEX idx_project_industry_code (industry_code)
  `);
  await addColumnIfMissing('project', 'pm_estimated_value', `
    ALTER TABLE project
    ADD COLUMN pm_estimated_value DECIMAL(12,2) NULL DEFAULT NULL AFTER predicted_hours
  `);
  await addColumnIfMissing('project', 'ai_estimated_value', `
    ALTER TABLE project
    ADD COLUMN ai_estimated_value DECIMAL(12,2) NULL DEFAULT NULL AFTER pm_estimated_value
  `);
  await addColumnIfMissing('project', 'actual_final_estimated_value', `
    ALTER TABLE project
    ADD COLUMN actual_final_estimated_value DECIMAL(12,2) NULL DEFAULT NULL AFTER actual_team_size
  `);
  await addColumnIfMissing('project', 'total_cr_estimation_impact', `
    ALTER TABLE project
    ADD COLUMN total_cr_estimation_impact DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER total_cr_team_impact
  `);
  await addColumnIfMissing('project', 'actual_completion_date', `
    ALTER TABLE project
    ADD COLUMN actual_completion_date DATE NULL AFTER actual_final_estimated_value
  `);
  await addColumnIfMissing('project', 'is_regression_data', `
    ALTER TABLE project
    ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0 AFTER approved_data
  `);

  return true;
}

async function addColumnIfMissing(tableName, columnName, alterSql) {
  const [columns] = await db.promise().query(
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
  await db.promise().query(alterSql);
  return true;
}

async function ensureProjectCompletionTables() {
  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS project_completion_history (
      completion_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      source_draft_id BIGINT UNSIGNED NOT NULL,
      completed_by_user_id BIGINT UNSIGNED NOT NULL,
      final_resource_loading JSON NOT NULL,
      management_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
      contingency_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
      resource_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
      full_project_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
      dependency_count DECIMAL(10,2) NULL DEFAULT NULL,
      requirement_stability_index DECIMAL(10,2) NULL DEFAULT NULL,
      actual_cr_volatility VARCHAR(50) NULL DEFAULT NULL,
      risk_level_indicators JSON NULL,
      actual_final_estimated_value DECIMAL(12,2) NULL DEFAULT NULL,
      completion_payload JSON NOT NULL,
      completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (completion_id),
      INDEX idx_project_completion_project (project_id),
      INDEX idx_project_completion_draft (source_draft_id),
      INDEX idx_project_completion_completed_at (completed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [completionColumns] = await db.promise().query(
    `
      SELECT DATA_TYPE AS dataType
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'project_completion_history'
        AND COLUMN_NAME = 'actual_cr_volatility'
      LIMIT 1
    `,
  );

  if (completionColumns[0]?.dataType !== 'varchar') {
    await db.promise().query(`
      ALTER TABLE project_completion_history
      MODIFY actual_cr_volatility VARCHAR(50) NULL DEFAULT NULL
    `);
  }

  await addColumnIfMissing('project_completion_history', 'actual_final_estimated_value', `
    ALTER TABLE project_completion_history
    ADD COLUMN actual_final_estimated_value DECIMAL(12,2) NULL DEFAULT NULL AFTER risk_level_indicators
  `);
  await addColumnIfMissing('project_completion_history', 'actual_completion_date', `
    ALTER TABLE project_completion_history
    ADD COLUMN actual_completion_date DATE NULL AFTER actual_final_estimated_value
  `);

  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS project_completion_resource_loading (
      completion_resource_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      completion_id BIGINT UNSIGNED NOT NULL,
      project_id BIGINT UNSIGNED NOT NULL,
      role VARCHAR(100) NOT NULL,
      location VARCHAR(100) NOT NULL,
      resource_count DECIMAL(10,2) NOT NULL DEFAULT 0,
      rate DECIMAL(14,2) NOT NULL DEFAULT 0,
      effort DECIMAL(14,2) NOT NULL DEFAULT 0,
      actual_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (completion_resource_id),
      INDEX idx_completion_resource_completion (completion_id),
      INDEX idx_completion_resource_project (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function ensureProjectProgressTables() {
  await ensureApprovedProjectTables();
  await db.promise().query(`
    CREATE TABLE IF NOT EXISTS project_progress_snapshot (
      snapshot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      snapshot_date DATE NOT NULL,
      actual_effort_pd DECIMAL(12,2) NOT NULL DEFAULT 0,
      actual_budget DECIMAL(14,2) NOT NULL DEFAULT 0,
      actual_team_size DECIMAL(10,2) NOT NULL DEFAULT 0,
      actual_completion_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
      remarks TEXT NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (snapshot_id),
      UNIQUE KEY uq_project_progress_snapshot_date (project_id, snapshot_date),
      INDEX idx_project_progress_project (project_id),
      INDEX idx_project_progress_snapshot_date (snapshot_date),
      INDEX idx_project_progress_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function createDraft(ownerId, draftData, status = 'DRAFT') {
  await ensureDraftTable();
  const sql = `
    INSERT INTO project_drafts (owner_id, draft_data, status)
    VALUES (?, ?, ?)
  `;
  const [result] = await db.promise().query(sql, [ownerId, JSON.stringify(draftData), status]);
  return { draftId: result.insertId };
}

async function updateDraft(draftId, ownerId, draftData, status = 'DRAFT') {
  await ensureDraftTable();
  const sql = `
    UPDATE project_drafts
    SET draft_data = ?, updated_at = NOW(), status = ?
    WHERE draft_id = ? AND owner_id = ? AND workflow_status <> 'APPROVED'
      AND COALESCE(is_regression_data, 0) = 0
  `;
  const [result] = await db.promise().query(sql, [JSON.stringify(draftData), status, draftId, ownerId]);
  return result.affectedRows > 0;
}

async function getDraftById(draftId, ownerId) {
  await ensureDraftTable();
  const sql = `
    SELECT draft_id AS draftId,
           owner_id AS ownerId,
           draft_data AS draftData,
           status,
           workflow_status AS workflowStatus,
           submitted_by_user_id AS submittedByUserId,
           (SELECT manager_id FROM app_user WHERE user_id = submitted_by_user_id) AS submittedByManagerId,
           (SELECT manager_id FROM app_user WHERE user_id = owner_id) AS ownerManagerId,
           approved_by_user_id AS approvedByUserId,
           submitted_at AS submittedAt,
           approved_at AS approvedAt,
           latest_comment AS latestComment,
           is_published AS isPublished,
           published_project_id AS publishedProjectId,
           published_at AS publishedAt,
           created_at AS createdAt,
           updated_at AS updatedAt
    FROM project_drafts
    WHERE draft_id = ? AND owner_id = ?
      AND COALESCE(is_regression_data, 0) = 0
    LIMIT 1
  `;
  const [rows] = await db.promise().query(sql, [draftId, ownerId]);
  if (!rows.length) {
    return null;
  }

  return {
    ...rows[0],
    draftData: parseDraftData(rows[0].draftData),
  };
}

async function markDraftSubmitted(draftId, ownerId) {
  await ensureDraftTable();
  const sql = `
    UPDATE project_drafts
    SET status = 'SUBMITTED', updated_at = NOW()
    WHERE draft_id = ? AND owner_id = ?
      AND COALESCE(is_regression_data, 0) = 0
  `;
  const [result] = await db.promise().query(sql, [draftId, ownerId]);
  return result.affectedRows > 0;
}

function parseDraftData(rawDraftData) {
  if (!rawDraftData) {
    return {};
  }

  if (typeof rawDraftData === 'object') {
    return rawDraftData;
  }

  if (typeof rawDraftData === 'string') {
    try {
      return JSON.parse(rawDraftData);
    } catch {
      return {};
    }
  }

  return {};
}

function normalizeNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sumObjectValues(value = {}) {
  return Object.values(value || {}).reduce((sum, next) => sum + normalizeNumber(next, 0), 0);
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function calculateCalendarDuration(startDate, endDate) {
  const start = startDate ? new Date(`${toDateOnly(startDate)}T00:00:00`) : null;
  const end = endDate ? new Date(`${toDateOnly(endDate)}T00:00:00`) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function calculateSeverity(expectedCompletionPercent, actualCompletionPercent, hasSnapshot) {
  if (!hasSnapshot) return 'Not Measured';
  const variance = Math.abs(normalizeNumber(expectedCompletionPercent, 0) - normalizeNumber(actualCompletionPercent, 0));
  if (variance <= 10) return 'Normal';
  if (variance <= 20) return 'Medium';
  if (variance <= 40) return 'High';
  return 'Urgent';
}

function plannedDurationFromProject(project) {
  const draftData = project?.draftData || {};
  const delivery = draftData.deliveryDetails || {};
  const baselineDuration = calculateCalendarDuration(delivery.start_date, delivery.planned_end_date);
  return baselineDuration + normalizeNumber(project?.totalCrScheduleImpactDays, 0);
}

function expectedCompletionForSnapshot(project, snapshotDate) {
  const draftData = project?.draftData || {};
  const delivery = draftData.deliveryDetails || {};
  const plannedDuration = plannedDurationFromProject(project);
  if (!plannedDuration || !delivery.start_date || !snapshotDate) return 0;
  const elapsed = calculateCalendarDuration(delivery.start_date, snapshotDate);
  return Math.max(0, Math.min(100, (elapsed / plannedDuration) * 100));
}

function mapProgressSnapshot(row, project = null) {
  if (!row) return null;
  const expectedCompletionPercent = project
    ? expectedCompletionForSnapshot(project, row.snapshotDate)
    : normalizeNumber(row.expectedCompletionPercent, 0);
  const actualCompletionPercent = normalizeNumber(row.actualCompletionPercent, 0);
  return {
    snapshotId: row.snapshotId,
    projectId: row.projectId,
    snapshotDate: toDateOnly(row.snapshotDate),
    actualEffortPd: normalizeNumber(row.actualEffortPd, 0),
    actualBudget: normalizeNumber(row.actualBudget, 0),
    actualTeamSize: normalizeNumber(row.actualTeamSize, 0),
    actualCompletionPercent,
    expectedCompletionPercent: Number(expectedCompletionPercent.toFixed(2)),
    completionVariancePercent: Number(Math.abs(expectedCompletionPercent - actualCompletionPercent).toFixed(2)),
    severity: calculateSeverity(expectedCompletionPercent, actualCompletionPercent, true),
    remarks: row.remarks || '',
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function extractPmEstimatedValue(data = {}) {
  return normalizeNumber(
    data.basicInfo?.pm_estimated_value
      ?? data.basicInfo?.pmEstimatedValue
      ?? data.estimation?.pmEstimatedValue,
    0,
  );
}

function extractAiEstimatedValue(data = {}) {
  const existing = data.baselineTracking?.estimation || data.estimation || {};
  const recommendation = data.mlRecommendation?.recommendation || {};
  return normalizeNumber(
    recommendation.estimation?.recommendedValue
      ?? recommendation.estimation?.estimatedValue
      ?? existing.aiEstimatedValue
      ?? existing.ai_estimated_value,
    null,
  );
}

function extractAiBaseline(data = {}) {
  const existing = data.baselineTracking?.ai || data.mlRecommendation?.aiBaseline || {};
  const recommendation = data.mlRecommendation?.recommendation || {};
  const snapshot = recommendation.baselineSnapshot || {};
  const recommendedTeam = recommendation.staffing?.recommendedTeam || {};
  const hasRecommendedTeam = Object.keys(recommendedTeam).length > 0;
  const effort = snapshot.effort
    ?? snapshot.plannedEffort
    ?? existing.effort
    ?? existing.ai_baseline_effort
    ?? recommendation.effort?.predictedHours
    ?? null;
  const budget = snapshot.budget
    ?? existing.budget
    ?? existing.ai_baseline_budget
    ?? null;
  const teamSize = snapshot.teamSize
    ?? snapshot.estimatedTeamSize
    ?? existing.teamSize
    ?? existing.ai_baseline_team_size
    ?? (hasRecommendedTeam ? sumObjectValues(recommendedTeam) : null);

  return {
    effort: effort === null || effort === undefined ? null : normalizeNumber(effort, null),
    budget: budget === null || budget === undefined ? null : normalizeNumber(budget, null),
    teamSize: teamSize === null || teamSize === undefined ? null : normalizeNumber(teamSize, null),
  };
}

function mapDraftDataToProject(row) {
  const draftData = parseDraftData(row.draftData);
  const legacy = draftData._legacy || {};
  const basicInfo = draftData.basicInfo || {};

  return {
    projectId: row.projectId,
    id: row.projectId,
    sourceDraftId: row.sourceDraftId,
    projectCode: row.projectCode,
    ownerId: row.ownerId,
    status: row.status,
    workflowStatus: row.workflowStatus || row.status,
    submittedByUserId: row.submittedByUserId,
    submittedByManagerId: row.submittedByManagerId,
    ownerManagerId: row.ownerManagerId,
    approvedByUserId: row.approvedByUserId,
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    latestComment: row.latestComment,
    isPublished: Boolean(row.isPublished),
    publishedProjectId: row.publishedProjectId,
    publishedAt: row.publishedAt,
    isRegressionData: Boolean(row.isRegressionData),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    name: legacy.name || basicInfo.project_name || 'Untitled Project',
    business_unit: legacy.business_unit || basicInfo.client_name || 'Unknown Client',
    technology: legacy.technology || (draftData.technology || {}).technology_stack || 'Unknown',
    complexity: legacy.complexity || (draftData.technology || {}).complexity || 0,
    team_size: legacy.team_size || (draftData.financial || {}).estimated_team_size || 0,
    estimated_hours: legacy.estimated_hours || (draftData.financial || {}).planned_effort || 0,
    avg_experience: legacy.avg_experience || 0,
    technology_score: legacy.technology_score || (draftData.technology || {}).integration_count || 0,
    draftData,
  };
}

async function findProjects() {
  await ensureDraftTable();
  const query = `
    SELECT draft_id AS projectId,
           owner_id AS ownerId,
           draft_data AS draftData,
           status,
           workflow_status AS workflowStatus,
           submitted_by_user_id AS submittedByUserId,
           (SELECT manager_id FROM app_user WHERE user_id = submitted_by_user_id) AS submittedByManagerId,
           (SELECT manager_id FROM app_user WHERE user_id = owner_id) AS ownerManagerId,
           approved_by_user_id AS approvedByUserId,
           submitted_at AS submittedAt,
           approved_at AS approvedAt,
           latest_comment AS latestComment,
           is_published AS isPublished,
           published_project_id AS publishedProjectId,
           published_at AS publishedAt,
           created_at AS createdAt,
           updated_at AS updatedAt
    FROM project_drafts
    WHERE workflow_status IN ('SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED')
    ORDER BY updated_at DESC
  `;
  const [rows] = await db.promise().query(query);
  return rows.map(mapDraftDataToProject);
}

const PROJECT_SORT_COLUMNS = {
  createdAt: 'p.created_at',
  createdDate: 'p.created_at',
  updatedAt: 'p.updated_at',
  updatedDate: 'p.updated_at',
  startDate: 'startDate',
  endDate: 'endDate',
  effectiveEndDate: 'endDate',
  projectName: "JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.project_name'))",
  name: "JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.project_name'))",
  status: 'p.workflow_status',
};

function buildProjectListWhere(filters) {
  const actorRoleRaw = String(filters.role || '').toUpperCase();
  const actorRole = actorRoleRaw === 'AM' ? 'ACCOUNT_MANAGER' : actorRoleRaw;
  const where = [];
  const params = [];

  if (actorRole === 'ACCOUNT_MANAGER') {
    where.push(`(
      EXISTS (
        SELECT 1
        FROM app_user assigned_pm
        WHERE assigned_pm.user_id = COALESCE(p.submitted_by_user_id, p.owner_id)
          AND assigned_pm.manager_id = ?
      )
      OR p.approved_by_user_id = ?
    )`);
    params.push(filters.userId, filters.userId);
  } else {
    where.push('(p.submitted_by_user_id = ? OR p.owner_id = ?)');
    params.push(filters.userId, filters.userId);
  }

  if (filters.search) {
    where.push(`(
      JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.project_name')) LIKE ?
      OR JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.client_name')) LIKE ?
      OR CONCAT('PRJ-', LPAD(p.draft_id, 6, '0')) LIKE ?
      OR CAST(p.draft_id AS CHAR) LIKE ?
    )`);
    const searchValue = `%${filters.search}%`;
    params.push(searchValue, searchValue, searchValue, searchValue);
  }

  if (filters.status) {
    where.push('p.workflow_status = ?');
    params.push(filters.status);
  }

  if (filters.industry) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.industry')) = ?");
    params.push(filters.industry);
  }

  if (filters.deliveryModel) {
    where.push("JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.delivery_model')) = ?");
    params.push(filters.deliveryModel);
  }

  if (filters.createdFrom) {
    where.push('DATE(p.created_at) >= ?');
    params.push(filters.createdFrom);
  }

  if (filters.createdTo) {
    where.push('DATE(p.created_at) <= ?');
    params.push(filters.createdTo);
  }

  where.push('COALESCE(p.is_regression_data, 0) = 0');

  return {
    sql: where.join(' AND '),
    params,
  };
}

function mapProjectListRow(row) {
  return {
    projectId: row.projectId,
    id: row.projectId,
    draftId: row.draftId,
    publishedProjectId: row.publishedProjectId,
    recordType: row.recordType || 'DRAFT',
    projectCode: row.projectCode,
    projectName: row.projectName || 'Untitled Project',
    clientName: row.clientName || '-',
    industry: row.industry || '-',
    deliveryModel: row.deliveryModel || '-',
    currentStatus: row.currentStatus || 'DRAFT',
    startDate: toDateOnly(row.startDate),
    plannedEndDate: toDateOnly(row.plannedEndDate),
    effectiveEndDate: toDateOnly(row.effectiveEndDate || row.endDate),
    approvedScheduleImpactDays: normalizeNumber(row.approvedScheduleImpactDays, 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    reviewerComment: row.reviewerComment || '-',
    severity: row.severity || 'Not Measured',
    canEdit: row.recordType !== 'APPROVED_PROJECT' && ['DRAFT', 'RETURNED'].includes(row.currentStatus),
    canCreateCr: row.recordType === 'APPROVED_PROJECT' && row.currentStatus === 'APPROVED',
    canComplete: row.recordType === 'APPROVED_PROJECT' && row.currentStatus === 'APPROVED',
    canTrackProgress: row.recordType === 'APPROVED_PROJECT' && row.currentStatus === 'APPROVED',
  };
}

async function findProjectsForPm(filters) {
  await ensureDraftTable();
  await ensureApprovedProjectTables();
  await ensureProjectProgressTables();

  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 10));
  const offset = (page - 1) * pageSize;
  const sortAliases = {
    createdAt: 'createdAt',
    createdDate: 'createdAt',
    updatedAt: 'updatedAt',
    updatedDate: 'updatedAt',
    startDate: 'startDate',
    endDate: 'effectiveEndDate',
    effectiveEndDate: 'effectiveEndDate',
    projectName: 'projectName',
    name: 'projectName',
    status: 'currentStatus',
    currentStatus: 'currentStatus',
  };
  const sortColumn = sortAliases[filters.sortBy] || 'updatedAt';
  const sortOrder = String(filters.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const where = buildProjectListWhere(filters);

  const [countRows] = await db.promise().query(
    `
      SELECT COUNT(*) AS totalRecords FROM (
        SELECT p.draft_id
        FROM project_drafts p
        WHERE ${where.sql}
          AND p.is_published = 0
        UNION ALL
        SELECT ap.project_id
        FROM project ap
        INNER JOIN project_drafts p ON p.draft_id = ap.source_draft_id
        WHERE ${where.sql}
          AND p.is_published = 1
          AND COALESCE(ap.is_regression_data, 0) = 0
      ) records
    `,
    [...where.params, ...where.params],
  );

  const [rows] = await db.promise().query(
    `
      SELECT * FROM (
      SELECT p.draft_id AS projectId,
             p.draft_id AS draftId,
             p.published_project_id AS publishedProjectId,
             'DRAFT' AS recordType,
             CONCAT('PRJ-', LPAD(p.draft_id, 6, '0')) AS projectCode,
             JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.project_name')) AS projectName,
             JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.client_name')) AS clientName,
             JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.industry')) AS industry,
             JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.delivery_model')) AS deliveryModel,
             p.workflow_status AS currentStatus,
             'Not Measured' AS severity,
             JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.deliveryDetails.start_date')) AS startDate,
             JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.deliveryDetails.planned_end_date')) AS plannedEndDate,
             JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.deliveryDetails.planned_end_date')) AS effectiveEndDate,
             0 AS approvedScheduleImpactDays,
             p.created_at AS createdAt,
             p.updated_at AS updatedAt,
             COALESCE(p.is_regression_data, 0) AS isRegressionData,
             reviewer.action_comment AS reviewerComment
      FROM project_drafts p
      LEFT JOIN (
        SELECT h.project_id, h.action_comment
        FROM project_workflow_history h
        INNER JOIN (
          SELECT project_id, MAX(workflow_history_id) AS workflow_history_id
          FROM project_workflow_history
          WHERE action_by_role = 'ACCOUNT_MANAGER'
          GROUP BY project_id
        ) latest
          ON latest.workflow_history_id = h.workflow_history_id
      ) reviewer
        ON reviewer.project_id = p.draft_id
      WHERE ${where.sql}
        AND p.is_published = 0
      UNION ALL
      SELECT ap.project_id AS projectId,
             p.draft_id AS draftId,
             ap.project_id AS publishedProjectId,
             'APPROVED_PROJECT' AS recordType,
             COALESCE(ap.project_code, CONCAT('PRJ-', LPAD(ap.project_id, 6, '0'))) AS projectCode,
             ap.project_name AS projectName,
             ap.client_name AS clientName,
             COALESCE(NULLIF(ap.industry, ''), ap.industry_code) AS industry,
             ap.delivery_model AS deliveryModel,
             CASE WHEN p.workflow_status = 'COMPLETE' THEN 'COMPLETE' ELSE 'APPROVED' END AS currentStatus,
             CASE
               WHEN latest_progress.snapshot_id IS NULL THEN 'Not Measured'
               WHEN ABS(
                 LEAST(100, GREATEST(0, (
                   (DATEDIFF(latest_progress.snapshot_date, JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.start_date'))) + 1)
                   / NULLIF(
                     (DATEDIFF(JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.planned_end_date')), JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.start_date'))) + 1)
                     + COALESCE(cr_schedule.totalScheduleImpactDays, 0),
                     0
                   )
                 ) * 100)) - COALESCE(latest_progress.actual_completion_percent, 0)
               ) <= 10 THEN 'Normal'
               WHEN ABS(
                 LEAST(100, GREATEST(0, (
                   (DATEDIFF(latest_progress.snapshot_date, JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.start_date'))) + 1)
                   / NULLIF(
                     (DATEDIFF(JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.planned_end_date')), JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.start_date'))) + 1)
                     + COALESCE(cr_schedule.totalScheduleImpactDays, 0),
                     0
                   )
                 ) * 100)) - COALESCE(latest_progress.actual_completion_percent, 0)
               ) <= 20 THEN 'Medium'
               WHEN ABS(
                 LEAST(100, GREATEST(0, (
                   (DATEDIFF(latest_progress.snapshot_date, JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.start_date'))) + 1)
                   / NULLIF(
                     (DATEDIFF(JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.planned_end_date')), JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.start_date'))) + 1)
                     + COALESCE(cr_schedule.totalScheduleImpactDays, 0),
                     0
                   )
                 ) * 100)) - COALESCE(latest_progress.actual_completion_percent, 0)
               ) <= 40 THEN 'High'
               ELSE 'Urgent'
             END AS severity,
             JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.start_date')) AS startDate,
             JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.planned_end_date')) AS plannedEndDate,
             DATE_ADD(
               JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.planned_end_date')),
               INTERVAL COALESCE(cr_schedule.totalScheduleImpactDays, 0) DAY
             ) AS effectiveEndDate,
             COALESCE(cr_schedule.totalScheduleImpactDays, 0) AS approvedScheduleImpactDays,
             ap.created_at AS createdAt,
             p.updated_at AS updatedAt,
             COALESCE(ap.is_regression_data, p.is_regression_data, 0) AS isRegressionData,
             reviewer.action_comment AS reviewerComment
      FROM project ap
      INNER JOIN project_drafts p ON p.draft_id = ap.source_draft_id
      LEFT JOIN (
        SELECT progress.*
        FROM project_progress_snapshot progress
        INNER JOIN (
          SELECT project_id, MAX(snapshot_date) AS snapshot_date
          FROM project_progress_snapshot
          GROUP BY project_id
        ) latest
          ON latest.project_id = progress.project_id
         AND latest.snapshot_date = progress.snapshot_date
      ) latest_progress
        ON latest_progress.project_id = ap.project_id
      LEFT JOIN (
        SELECT project_id, SUM(schedule_impact_days) AS totalScheduleImpactDays
        FROM change_request
        WHERE workflow_status = 'APPROVED'
        GROUP BY project_id
      ) cr_schedule
        ON cr_schedule.project_id = ap.project_id
      LEFT JOIN (
        SELECT h.project_id, h.action_comment
        FROM project_workflow_history h
        INNER JOIN (
          SELECT project_id, MAX(workflow_history_id) AS workflow_history_id
          FROM project_workflow_history
          WHERE action_by_role = 'ACCOUNT_MANAGER'
          GROUP BY project_id
        ) latest
          ON latest.workflow_history_id = h.workflow_history_id
      ) reviewer
        ON reviewer.project_id = p.draft_id
      WHERE ${where.sql}
        AND p.is_published = 1
        AND COALESCE(ap.is_regression_data, 0) = 0
      ) project_rows
      ORDER BY ${sortColumn} ${sortOrder}, projectId DESC
      LIMIT ? OFFSET ?
    `,
    [...where.params, ...where.params, pageSize, offset],
  );

  const totalRecords = Number(countRows[0]?.totalRecords || 0);
  return {
    items: rows.map(mapProjectListRow),
    page,
    pageSize,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
  };
}

async function findApprovedProjectsAvailableForCr(user) {
  await ensureDraftTable();
  await ensureApprovedProjectTables();
  const rawRole = String(user.role || '').toUpperCase();
  const role = rawRole === 'AM' ? 'ACCOUNT_MANAGER' : rawRole;
  const params = [];
  const where = [];

  if (role === 'PM') {
    where.push('(ap.owner_id = ? OR pd.submitted_by_user_id = ?)');
    params.push(user.userId, user.userId);
  } else if (role === 'ACCOUNT_MANAGER') {
    where.push(`(
      EXISTS (
        SELECT 1
        FROM app_user assigned_pm
        WHERE assigned_pm.user_id = COALESCE(pd.submitted_by_user_id, ap.owner_id)
          AND assigned_pm.manager_id = ?
      )
      OR ap.approved_by_user_id = ?
    )`);
    params.push(user.userId, user.userId);
  } else {
    return [];
  }

  const [rows] = await db.promise().query(
    `
      SELECT ap.project_id AS projectId,
             COALESCE(ap.project_code, CONCAT('PRJ-', LPAD(ap.project_id, 6, '0'))) AS projectCode,
             ap.project_name AS projectName,
             ap.client_name AS clientName,
             COALESCE(NULLIF(ap.industry, ''), ap.industry_code) AS industry,
             ap.delivery_model AS deliveryModel,
             ap.current_planned_effort AS currentPlannedEffort,
             ap.current_planned_budget AS currentPlannedBudget,
             ap.current_planned_team_size AS currentPlannedTeamSize,
             ap.actual_final_estimated_value AS currentEstimation,
             (
               DATEDIFF(JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.planned_end_date')),
                        JSON_UNQUOTE(JSON_EXTRACT(ap.approved_data, '$.deliveryDetails.start_date'))) + 1
             ) + COALESCE(cr_schedule.totalScheduleImpactDays, 0) AS currentPlannedDuration,
             CASE WHEN pd.workflow_status = 'COMPLETE' THEN 'COMPLETE' ELSE 'APPROVED' END AS currentStatus,
             'APPROVED_PROJECT' AS recordType,
             CASE WHEN pd.workflow_status = 'APPROVED' THEN 1 ELSE 0 END AS canCreateCr
      FROM project ap
      INNER JOIN project_drafts pd ON pd.draft_id = ap.source_draft_id
      LEFT JOIN (
        SELECT project_id, SUM(schedule_impact_days) AS totalScheduleImpactDays
        FROM change_request
        WHERE workflow_status = 'APPROVED'
        GROUP BY project_id
      ) cr_schedule
        ON cr_schedule.project_id = ap.project_id
      WHERE ${where.join(' AND ')}
        AND pd.workflow_status = 'APPROVED'
        AND COALESCE(ap.is_regression_data, 0) = 0
        AND COALESCE(pd.is_regression_data, 0) = 0
      ORDER BY ap.updated_at DESC, ap.project_id DESC
    `,
    params,
  );

  return rows.map((row) => ({
    ...row,
    canCreateCr: Boolean(row.canCreateCr),
    currentApprovedValues: {
      effort: row.currentPlannedEffort,
      budget: row.currentPlannedBudget,
      teamSize: row.currentPlannedTeamSize,
      duration: row.currentPlannedDuration,
      estimation: row.currentEstimation,
    },
  }));
}

async function insertProject(projectRecord) {
  throw new Error('Legacy project insert is no longer available. Use draft submission instead.');
}

async function getSubmittedProjectById(projectId) {
  await ensureDraftTable();
  const query = `
    SELECT draft_id AS projectId,
           owner_id AS ownerId,
           draft_data AS draftData,
           status,
           workflow_status AS workflowStatus,
           submitted_by_user_id AS submittedByUserId,
           approved_by_user_id AS approvedByUserId,
           submitted_at AS submittedAt,
           approved_at AS approvedAt,
           latest_comment AS latestComment,
           is_published AS isPublished,
           published_project_id AS publishedProjectId,
           published_at AS publishedAt,
           created_at AS createdAt,
           updated_at AS updatedAt
    FROM project_drafts
    WHERE draft_id = ? AND workflow_status IN ('SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED')
    LIMIT 1
  `;
  const [rows] = await db.promise().query(query, [projectId]);
  if (!rows.length) {
    return null;
  }
  return mapDraftDataToProject(rows[0]);
}

async function getProjectById(projectId) {
  await ensureApprovedProjectTables();
  const query = `
    SELECT ap.project_id AS projectId,
           ap.source_draft_id AS sourceDraftId,
           ap.project_code AS projectCode,
           ap.owner_id AS ownerId,
           ap.approved_data AS draftData,
           ap.ai_baseline_effort AS aiBaselineEffort,
           ap.ai_baseline_budget AS aiBaselineBudget,
           ap.ai_baseline_team_size AS aiBaselineTeamSize,
           ap.pm_estimated_value AS pmEstimatedValue,
           ap.ai_estimated_value AS aiEstimatedValue,
           ap.pm_baseline_effort AS pmBaselineEffort,
           ap.pm_baseline_budget AS pmBaselineBudget,
           ap.pm_baseline_team_size AS pmBaselineTeamSize,
           ap.current_planned_effort AS currentPlannedEffort,
           ap.current_planned_budget AS currentPlannedBudget,
           ap.current_planned_team_size AS currentPlannedTeamSize,
           ap.actual_effort AS actualEffort,
           ap.actual_budget AS actualBudget,
           ap.actual_team_size AS actualTeamSize,
           ap.actual_final_estimated_value AS actualFinalEstimatedValue,
           ap.actual_completion_date AS actualCompletionDate,
           ap.total_cr_effort_impact AS totalCrEffortImpact,
           ap.total_cr_budget_impact AS totalCrBudgetImpact,
           ap.total_cr_team_impact AS totalCrTeamImpact,
           ap.total_cr_estimation_impact AS totalCrEstimationImpact,
           COALESCE(cr_schedule.totalScheduleImpactDays, 0) AS totalCrScheduleImpactDays,
           CASE WHEN pd.workflow_status = 'COMPLETE' THEN 'COMPLETE' ELSE 'APPROVED' END AS status,
           CASE WHEN pd.workflow_status = 'COMPLETE' THEN 'COMPLETE' ELSE 'APPROVED' END AS workflowStatus,
           pd.submitted_by_user_id AS submittedByUserId,
           (SELECT manager_id FROM app_user WHERE user_id = pd.submitted_by_user_id) AS submittedByManagerId,
           (SELECT manager_id FROM app_user WHERE user_id = ap.owner_id) AS ownerManagerId,
           ap.approved_by_user_id AS approvedByUserId,
           pd.submitted_at AS submittedAt,
           ap.approved_at AS approvedAt,
           pd.latest_comment AS latestComment,
           ap.created_at AS createdAt,
           pd.updated_at AS updatedAt
           ,COALESCE(ap.is_regression_data, pd.is_regression_data, 0) AS isRegressionData
    FROM project ap
    INNER JOIN project_drafts pd ON pd.draft_id = ap.source_draft_id
    LEFT JOIN (
      SELECT project_id, SUM(schedule_impact_days) AS totalScheduleImpactDays
      FROM change_request
      WHERE workflow_status = 'APPROVED'
      GROUP BY project_id
    ) cr_schedule
      ON cr_schedule.project_id = ap.project_id
    WHERE ap.project_id = ?
    LIMIT 1
  `;
  const [rows] = await db.promise().query(query, [projectId]);
  if (!rows.length) {
    return null;
  }
  const project = mapDraftDataToProject(rows[0]);
  const mappedProject = {
    ...project,
    baselineTracking: {
      ai: {
        effort: rows[0].aiBaselineEffort,
        budget: rows[0].aiBaselineBudget,
        teamSize: rows[0].aiBaselineTeamSize,
      },
      estimation: {
        pmEstimatedValue: rows[0].pmEstimatedValue,
        aiEstimatedValue: rows[0].aiEstimatedValue,
        actualFinalEstimatedValue: rows[0].actualFinalEstimatedValue,
        totalCrEstimationImpact: rows[0].totalCrEstimationImpact,
      },
      pm: {
        effort: rows[0].pmBaselineEffort,
        budget: rows[0].pmBaselineBudget,
        teamSize: rows[0].pmBaselineTeamSize,
      },
      current: {
        effort: rows[0].currentPlannedEffort,
        budget: rows[0].currentPlannedBudget,
        teamSize: rows[0].currentPlannedTeamSize,
      },
      actual: {
        effort: rows[0].actualEffort,
        budget: rows[0].actualBudget,
        teamSize: rows[0].actualTeamSize,
      },
      crImpact: {
        effort: rows[0].totalCrEffortImpact,
        budget: rows[0].totalCrBudgetImpact,
        teamSize: rows[0].totalCrTeamImpact,
      },
    },
    actualCompletionDate: toDateOnly(rows[0].actualCompletionDate),
    totalCrScheduleImpactDays: rows[0].totalCrScheduleImpactDays,
  };
  await ensureProjectProgressTables();
  const [progressRows] = await db.promise().query(
    `
      SELECT snapshot_id AS snapshotId,
             project_id AS projectId,
             snapshot_date AS snapshotDate,
             actual_effort_pd AS actualEffortPd,
             actual_budget AS actualBudget,
             actual_team_size AS actualTeamSize,
             actual_completion_percent AS actualCompletionPercent,
             remarks,
             created_by AS createdBy,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM project_progress_snapshot
      WHERE project_id = ?
      ORDER BY snapshot_date DESC, snapshot_id DESC
      LIMIT 1
    `,
    [projectId],
  );
  const latestProgressSnapshot = progressRows.length ? mapProgressSnapshot(progressRows[0], mappedProject) : null;
  return {
    ...mappedProject,
    latestProgressSnapshot,
    severity: latestProgressSnapshot?.severity || 'Not Measured',
  };
}

async function findProgressSnapshots(projectId) {
  await ensureProjectProgressTables();
  const project = await getProjectById(projectId);
  const [rows] = await db.promise().query(
    `
      SELECT snapshot_id AS snapshotId,
             project_id AS projectId,
             snapshot_date AS snapshotDate,
             actual_effort_pd AS actualEffortPd,
             actual_budget AS actualBudget,
             actual_team_size AS actualTeamSize,
             actual_completion_percent AS actualCompletionPercent,
             remarks,
             created_by AS createdBy,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM project_progress_snapshot
      WHERE project_id = ?
      ORDER BY snapshot_date DESC, snapshot_id DESC
    `,
    [projectId],
  );
  return rows.map((row) => mapProgressSnapshot(row, project));
}

async function getProgressSnapshotByDate(projectId, snapshotDate) {
  await ensureProjectProgressTables();
  const project = await getProjectById(projectId);
  const [rows] = await db.promise().query(
    `
      SELECT snapshot_id AS snapshotId,
             project_id AS projectId,
             snapshot_date AS snapshotDate,
             actual_effort_pd AS actualEffortPd,
             actual_budget AS actualBudget,
             actual_team_size AS actualTeamSize,
             actual_completion_percent AS actualCompletionPercent,
             remarks,
             created_by AS createdBy,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM project_progress_snapshot
      WHERE project_id = ? AND snapshot_date = ?
      LIMIT 1
    `,
    [projectId, snapshotDate],
  );
  return rows.length ? mapProgressSnapshot(rows[0], project) : null;
}

async function getLatestProgressSnapshot(projectId) {
  await ensureProjectProgressTables();
  const snapshots = await findProgressSnapshots(projectId);
  return snapshots[0] || null;
}

async function upsertProgressSnapshot(projectId, userId, snapshot) {
  await ensureProjectProgressTables();
  await db.promise().query(
    `
      INSERT INTO project_progress_snapshot
        (project_id, snapshot_date, actual_effort_pd, actual_budget, actual_team_size,
         actual_completion_percent, remarks, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        actual_effort_pd = VALUES(actual_effort_pd),
        actual_budget = VALUES(actual_budget),
        actual_team_size = VALUES(actual_team_size),
        actual_completion_percent = VALUES(actual_completion_percent),
        remarks = VALUES(remarks),
        updated_at = NOW()
    `,
    [
      projectId,
      snapshot.snapshotDate,
      normalizeNumber(snapshot.actualEffortPd, 0),
      normalizeNumber(snapshot.actualBudget, 0),
      normalizeNumber(snapshot.actualTeamSize, 0),
      normalizeNumber(snapshot.actualCompletionPercent, 0),
      snapshot.remarks || null,
      userId,
    ],
  );
  return getProgressSnapshotByDate(projectId, snapshot.snapshotDate);
}

async function getProjectForCompletion(connection, projectId) {
  const [rows] = await connection.query(
    `
      SELECT ap.project_id AS projectId,
             ap.source_draft_id AS sourceDraftId,
             ap.owner_id AS ownerId,
             ap.project_name AS projectName,
             ap.project_code AS projectCode,
             ap.actual_final_estimated_value AS actualFinalEstimatedValue,
             ap.actual_completion_date AS actualCompletionDate,
             pd.submitted_by_user_id AS submittedByUserId,
             pd.approved_by_user_id AS approvedByUserId,
             pd.workflow_status AS workflowStatus
      FROM project ap
      INNER JOIN project_drafts pd ON pd.draft_id = ap.source_draft_id
      WHERE ap.project_id = ?
      FOR UPDATE
    `,
    [projectId],
  );
  return rows[0] || null;
}

async function insertProjectCompletion(connection, completion) {
  const [result] = await connection.query(
    `
      INSERT INTO project_completion_history
        (project_id, source_draft_id, completed_by_user_id, final_resource_loading,
         management_cost, contingency_cost, resource_cost, full_project_cost,
         dependency_count, requirement_stability_index, actual_cr_volatility,
         risk_level_indicators, actual_final_estimated_value, actual_completion_date, completion_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      completion.projectId,
      completion.sourceDraftId,
      completion.completedByUserId,
      JSON.stringify(completion.finalResourceLoading),
      completion.managementCost,
      completion.contingencyCost,
      completion.resourceCost,
      completion.fullProjectCost,
      completion.dependencyCount,
      completion.requirementStabilityIndex,
      completion.actualCrVolatility,
      JSON.stringify(completion.riskLevelIndicators),
      completion.actualFinalEstimatedValue,
      completion.actualCompletionDate || null,
      JSON.stringify(completion.payload),
    ],
  );

  if (completion.finalResourceLoading.length) {
    const values = completion.finalResourceLoading.map((row) => [
      result.insertId,
      completion.projectId,
      row.role,
      row.location,
      row.count,
      row.rate,
      row.effort,
      row.actualCost,
    ]);
    await connection.query(
      `
        INSERT INTO project_completion_resource_loading
          (completion_id, project_id, role, location, resource_count, rate, effort, actual_cost)
        VALUES ?
      `,
      [values],
    );
  }

  return { completionId: result.insertId };
}

async function updateProjectActuals(connection, projectId, actuals) {
  const [result] = await connection.query(
    `
      UPDATE project
      SET actual_effort = ?,
          actual_budget = ?,
          actual_team_size = ?,
          actual_final_estimated_value = ?,
          actual_completion_date = ?
      WHERE project_id = ?
    `,
    [
      normalizeNumber(actuals.actualEffort, 0),
      normalizeNumber(actuals.actualBudget, 0),
      normalizeNumber(actuals.actualTeamSize, 0),
      normalizeNumber(actuals.actualFinalEstimatedValue, 0),
      actuals.actualCompletionDate || null,
      projectId,
    ],
  );
  return result.affectedRows > 0;
}

async function markProjectComplete(connection, draftId, projectId, user, comment) {
  const [result] = await connection.query(
    `
      UPDATE project_drafts
      SET status = 'COMPLETE',
          workflow_status = 'COMPLETE',
          latest_comment = ?,
          updated_at = NOW()
      WHERE draft_id = ? AND workflow_status = 'APPROVED'
    `,
    [comment, draftId],
  );

  if (result.affectedRows === 0) {
    return false;
  }

  await connection.query(
    `
      INSERT INTO project_workflow_history
        (project_id, from_status, to_status, action_by_user_id, action_by_role, action_comment, action_type)
      VALUES (?, 'APPROVED', 'COMPLETE', ?, ?, ?, 'COMPLETE')
    `,
    [draftId, user.userId, String(user.role || '').toUpperCase(), comment],
  );

  return true;
}

async function getDraftProjectById(draftId) {
  await ensureDraftTable();
  const query = `
    SELECT draft_id AS projectId,
           owner_id AS ownerId,
           draft_data AS draftData,
           status,
           workflow_status AS workflowStatus,
           submitted_by_user_id AS submittedByUserId,
           (SELECT manager_id FROM app_user WHERE user_id = submitted_by_user_id) AS submittedByManagerId,
           (SELECT manager_id FROM app_user WHERE user_id = owner_id) AS ownerManagerId,
           approved_by_user_id AS approvedByUserId,
           submitted_at AS submittedAt,
           approved_at AS approvedAt,
           latest_comment AS latestComment,
           is_published AS isPublished,
           published_project_id AS publishedProjectId,
           published_at AS publishedAt,
           created_at AS createdAt,
           updated_at AS updatedAt
           ,COALESCE(is_regression_data, 0) AS isRegressionData
    FROM project_drafts
    WHERE draft_id = ?
    LIMIT 1
  `;
  const [rows] = await db.promise().query(query, [draftId]);
  if (!rows.length) return null;
  return mapDraftDataToProject(rows[0]);
}

async function getDraftForPublishing(connection, draftId) {
  const [rows] = await connection.query(
    `
      SELECT draft_id AS draftId,
             owner_id AS ownerId,
             draft_data AS draftData,
             workflow_status AS workflowStatus,
             approved_by_user_id AS approvedByUserId,
             approved_at AS approvedAt,
             is_published AS isPublished,
             published_project_id AS publishedProjectId
      FROM project_drafts
      WHERE draft_id = ?
      FOR UPDATE
    `,
    [draftId],
  );
  if (!rows.length) return null;
  return {
    ...rows[0],
    draftData: parseDraftData(rows[0].draftData),
    isPublished: Boolean(rows[0].isPublished),
  };
}

async function insertApprovedProject(connection, draft, approvedByUserId) {
  const data = draft.draftData || {};
  const basic = data.basicInfo || {};
  const technology = data.technology || {};
  const financial = data.financial || {};
  const aiBaseline = extractAiBaseline(data);
  const pmEstimatedValue = extractPmEstimatedValue(data);
  const aiEstimatedValue = extractAiEstimatedValue(data);
  const pmBaseline = {
    effort: normalizeNumber(financial.planned_effort, 0),
    budget: normalizeNumber(financial.budget, 0),
    teamSize: normalizeNumber(financial.estimated_team_size, 0),
  };
  console.info('Initializing project baselines', {
    draftId: draft.draftId,
    aiBaseline,
    pmBaseline,
  });
  const [result] = await connection.query(
    `
      INSERT INTO project
        (source_draft_id, owner_id, project_name, client_name, industry, industry_code, project_type, delivery_model,
         technology_stack, complexity, estimated_team_size, planned_effort, budget, predicted_hours,
         pm_estimated_value, ai_estimated_value, actual_final_estimated_value,
         ai_baseline_effort, ai_baseline_budget, ai_baseline_team_size,
         pm_baseline_effort, pm_baseline_budget, pm_baseline_team_size,
         current_planned_effort, current_planned_budget, current_planned_team_size,
         approved_data, approved_by_user_id, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      draft.draftId,
      draft.ownerId,
      basic.project_name || 'Untitled Project',
      basic.client_name || '',
      basic.industry || '',
      basic.industry_code || basic.industryCode || '',
      basic.project_type || '',
      basic.delivery_model || '',
      technology.technology_stack || '',
      normalizeNumber(technology.complexity, 0),
      pmBaseline.teamSize,
      pmBaseline.effort,
      pmBaseline.budget,
      0,
      pmEstimatedValue,
      aiEstimatedValue,
      pmEstimatedValue,
      aiBaseline.effort,
      aiBaseline.budget,
      aiBaseline.teamSize,
      pmBaseline.effort,
      pmBaseline.budget,
      pmBaseline.teamSize,
      pmBaseline.effort,
      pmBaseline.budget,
      pmBaseline.teamSize,
      JSON.stringify(data),
      approvedByUserId,
    ],
  );

  await connection.query(
    "UPDATE project SET project_code = CONCAT('PRJ-', LPAD(project_id, 6, '0')) WHERE project_id = ?",
    [result.insertId],
  );

  return result.insertId;
}

async function insertProjectTeamSnapshots(connection, projectId, teamRows = []) {
  if (!Array.isArray(teamRows) || teamRows.length === 0) return;
  const values = teamRows.map((row) => [
    projectId,
    Number(row.roleId) || null,
    row.role || '',
    row.locationType || 'ONSITE',
    Number(row.count) || 0,
    Number(row.allocationPercent) || 0,
    row.startDate || null,
    row.endDate || null,
    Number(row.ratePerDay) || 0,
    Number(row.plannedEffort) || 0,
    Number(row.plannedCost) || 0,
    Number(row.avgExperience) || 0,
    row.location || '',
  ]);
  await connection.query(
    `
      INSERT INTO project_team_snapshot
        (project_id, role_id, role, location_type, resource_count, allocation_percent, allocation_start_date, allocation_end_date,
         rate_per_day, planned_effort, planned_cost, avg_experience_years, location)
      VALUES ?
    `,
    [values],
  );
}

async function markDraftPublished(connection, draftId, projectId) {
  const [result] = await connection.query(
    `
      UPDATE project_drafts
      SET is_published = 1,
          published_project_id = ?,
          published_at = NOW()
      WHERE draft_id = ? AND is_published = 0
    `,
    [projectId, draftId],
  );
  return result.affectedRows > 0;
}

module.exports = {
  createDraft,
  updateDraft,
  getDraftById,
  markDraftSubmitted,
  findProjects,
  findApprovedProjectsAvailableForCr,
  findProjectsForPm,
  getSubmittedProjectById,
  getProjectById,
  getDraftProjectById,
  getDraftForPublishing,
  ensureApprovedProjectTables,
  ensureProjectCompletionTables,
  ensureProjectProgressTables,
  ensureDraftTable,
  findProgressSnapshots,
  getLatestProgressSnapshot,
  getProgressSnapshotByDate,
  getProjectForCompletion,
  insertProjectCompletion,
  updateProjectActuals,
  insertApprovedProject,
  insertProjectTeamSnapshots,
  markProjectComplete,
  markDraftPublished,
  upsertProgressSnapshot,
  insertProject,
};
