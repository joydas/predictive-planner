const { pool: db } = require('../config/db.config');
const TenantContext = require('../utils/tenantContext');

async function ensureDraftTable() {
  await addColumnIfMissing('project_drafts', 'is_regression_data', `
    ALTER TABLE project_drafts
    ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0 AFTER published_at
  `);
  return true;
}

async function ensureApprovedProjectTables() {
  await addColumnIfMissing('project', 'status', `
    ALTER TABLE project
    ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'APPROVED' AFTER owner_id,
    ADD INDEX idx_project_status (status)
  `);
  await addColumnIfMissing('project', 'workflow_status', `
    ALTER TABLE project
    ADD COLUMN workflow_status VARCHAR(32) NOT NULL DEFAULT 'APPROVED' AFTER status,
    ADD INDEX idx_project_workflow_status (workflow_status)
  `);
  await addColumnIfMissing('project', 'submitted_by_user_id', `
    ALTER TABLE project
    ADD COLUMN submitted_by_user_id BIGINT UNSIGNED NULL AFTER workflow_status,
    ADD INDEX idx_project_submitted_by (submitted_by_user_id)
  `);
  await addColumnIfMissing('project', 'submitted_at', `
    ALTER TABLE project
    ADD COLUMN submitted_at TIMESTAMP NULL DEFAULT NULL AFTER submitted_by_user_id
  `);
  await addColumnIfMissing('project', 'latest_comment', `
    ALTER TABLE project
    ADD COLUMN latest_comment TEXT NULL AFTER approved_at
  `);
  await addColumnIfMissing('project', 'current_status_id', `
    ALTER TABLE project
    ADD COLUMN current_status_id INT NULL AFTER workflow_status
  `);
  await makeProjectSourceDraftNullable();
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
  await addColumnIfMissing('project', 'business_criticality', `
    ALTER TABLE project
    ADD COLUMN business_criticality VARCHAR(50) NULL AFTER delivery_model
  `);
  await addColumnIfMissing('project', 'architecture_type', `
    ALTER TABLE project
    ADD COLUMN architecture_type VARCHAR(100) NULL AFTER technology_stack
  `);
  await addColumnIfMissing('project', 'cloud_platform', `
    ALTER TABLE project
    ADD COLUMN cloud_platform VARCHAR(100) NULL AFTER architecture_type
  `);
  await addColumnIfMissing('project', 'billing_model', `
    ALTER TABLE project
    ADD COLUMN billing_model VARCHAR(100) NULL AFTER budget
  `);
  await addColumnIfMissing('project', 'start_date', `
    ALTER TABLE project
    ADD COLUMN start_date DATE NULL AFTER billing_model
  `);
  await addColumnIfMissing('project', 'planned_end_date', `
    ALTER TABLE project
    ADD COLUMN planned_end_date DATE NULL AFTER start_date
  `);
  await addColumnIfMissing('project', 'is_regression_data', `
    ALTER TABLE project
    ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0 AFTER approved_data
  `);

  return true;
}

async function makeProjectSourceDraftNullable() {
  const [columns] = await db.promise().query(
    `
      SELECT IS_NULLABLE AS isNullable
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'project'
        AND COLUMN_NAME = 'source_draft_id'
      LIMIT 1
    `,
  );
  if (columns[0]?.isNullable === 'NO') {
    await db.promise().query('ALTER TABLE project MODIFY source_draft_id BIGINT UNSIGNED NULL');
  }
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
      source_draft_id BIGINT UNSIGNED NULL,
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

  const [sourceDraftColumns] = await db.promise().query(
    `
      SELECT IS_NULLABLE AS isNullable
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'project_completion_history'
        AND COLUMN_NAME = 'source_draft_id'
      LIMIT 1
    `,
  );

  if (sourceDraftColumns[0]?.isNullable === 'NO') {
    await db.promise().query('ALTER TABLE project_completion_history MODIFY source_draft_id BIGINT UNSIGNED NULL');
  }

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
  const organizationId = TenantContext.getOrganizationId();
  const sql = `
    INSERT INTO project_drafts (organization_id, owner_id, draft_data, status)
    VALUES (?, ?, ?, ?)
  `;
  const [result] = await db.promise().query(sql, [organizationId, ownerId, JSON.stringify(draftData), status]);
  return { draftId: result.insertId };
}

async function updateDraft(draftId, ownerId, draftData, status = 'DRAFT') {
  await ensureDraftTable();
  const organizationId = TenantContext.getOrganizationId();
  const sql = `
    UPDATE project_drafts
    SET draft_data = ?, updated_at = NOW(), status = ?
    WHERE draft_id = ? AND owner_id = ? AND organization_id = ? AND workflow_status <> 'APPROVED'
      AND COALESCE(is_regression_data, 0) = 0
  `;
  const [result] = await db.promise().query(sql, [JSON.stringify(draftData), status, draftId, ownerId, organizationId]);
  return result.affectedRows > 0;
}

async function createLifecycleProjectDraft(ownerId, organizationId, draftData, status = 'DRAFT') {
  await ensureApprovedProjectTables();
  const values = buildProjectPersistenceValues(draftData, ownerId);
  const orgId = organizationId || TenantContext.getOrganizationId();
  const [result] = await db.promise().query(
    `
      INSERT INTO project
        (organization_id, source_draft_id, owner_id, status, workflow_status, project_name, client_name, industry, industry_code,
         project_type, delivery_model, business_criticality, technology_stack, architecture_type, cloud_platform, 
         complexity, estimated_team_size, planned_effort, budget, billing_model, start_date, planned_end_date,
         predicted_hours, pm_estimated_value, ai_estimated_value, actual_final_estimated_value,
         ai_baseline_effort, ai_baseline_budget, ai_baseline_team_size,
         pm_baseline_effort, pm_baseline_budget, pm_baseline_team_size,
         current_planned_effort, current_planned_budget, current_planned_team_size,
         approved_data)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      orgId,
      ownerId,
      status,
      status,
      values.projectName,
      values.clientName,
      values.industry,
      values.industryCode,
      values.projectType,
      values.deliveryModel,
      values.businessCriticality,
      values.technologyStack,
      values.architectureType,
      values.cloudPlatform,
      values.complexity,
      values.estimatedTeamSize,
      values.plannedEffort,
      values.budget,
      values.billingModel,
      values.startDate,
      values.plannedEndDate,
      values.pmEstimatedValue,
      values.aiEstimatedValue,
      values.actualFinalEstimatedValue,
      values.aiBaseline.effort,
      values.aiBaseline.budget,
      values.aiBaseline.teamSize,
      values.pmBaseline.effort,
      values.pmBaseline.budget,
      values.pmBaseline.teamSize,
      values.pmBaseline.effort,
      values.pmBaseline.budget,
      values.pmBaseline.teamSize,
      values.approvedData,
    ],
  );

  await db.promise().query(
    "UPDATE project SET project_code = CONCAT('PRJ-', LPAD(project_id, 6, '0')) WHERE project_id = ? AND organization_id = ?",
    [result.insertId, orgId],
  );

  return { projectId: result.insertId, draftId: result.insertId };
}

async function updateLifecycleProjectDraft(projectId, ownerId, organizationId, draftData) {
  await ensureApprovedProjectTables();
  const orgId = organizationId || TenantContext.getOrganizationId();
  const values = buildProjectPersistenceValues(draftData, ownerId);
  const [result] = await db.promise().query(
    `
      UPDATE project
      SET project_name = ?,
          client_name = ?,
          industry = ?,
          industry_code = ?,
          project_type = ?,
          delivery_model = ?,
          business_criticality = ?,
          technology_stack = ?,
          architecture_type = ?,
          cloud_platform = ?,
          complexity = ?,
          estimated_team_size = ?,
          planned_effort = ?,
          budget = ?,
          billing_model = ?,
          start_date = ?,
          planned_end_date = ?,
          pm_estimated_value = ?,
          ai_estimated_value = ?,
          actual_final_estimated_value = ?,
          ai_baseline_effort = ?,
          ai_baseline_budget = ?,
          ai_baseline_team_size = ?,
          pm_baseline_effort = ?,
          pm_baseline_budget = ?,
          pm_baseline_team_size = ?,
          current_planned_effort = ?,
          current_planned_budget = ?,
          current_planned_team_size = ?,
          approved_data = ?,
          updated_at = NOW()
      WHERE project_id = ?
        AND organization_id = ?
        AND source_draft_id IS NULL
        AND owner_id = ?
        AND workflow_status IN ('DRAFT', 'RETURNED', 'REJECTED')
        AND COALESCE(is_regression_data, 0) = 0
    `,
    [
      values.projectName,
      values.clientName,
      values.industry,
      values.industryCode,
      values.projectType,
      values.deliveryModel,
      values.businessCriticality,
      values.technologyStack,
      values.architectureType,
      values.cloudPlatform,
      values.complexity,
      values.estimatedTeamSize,
      values.plannedEffort,
      values.budget,
      values.billingModel,
      values.startDate,
      values.plannedEndDate,
      values.pmEstimatedValue,
      values.aiEstimatedValue,
      values.actualFinalEstimatedValue,
      values.aiBaseline.effort,
      values.aiBaseline.budget,
      values.aiBaseline.teamSize,
      values.pmBaseline.effort,
      values.pmBaseline.budget,
      values.pmBaseline.teamSize,
      values.pmBaseline.effort,
      values.pmBaseline.budget,
      values.pmBaseline.teamSize,
      values.approvedData,
      projectId,
      orgId,
      ownerId,
    ],
  );
  return result.affectedRows > 0;
}

async function getLifecycleProjectDraftById(projectId, ownerId = null) {
  await ensureApprovedProjectTables();
  const organizationId = TenantContext.getOrganizationId();
  const params = [projectId, organizationId];
  let ownerClause = '';
  if (ownerId !== null && ownerId !== undefined) {
    ownerClause = 'AND p.owner_id = ?';
    params.push(ownerId);
  }
  const [rows] = await db.promise().query(
    `
      SELECT p.project_id AS projectId,
             p.organization_id AS organizationId,
             p.source_draft_id AS sourceDraftId,

             p.project_code AS projectCode,
             p.owner_id AS ownerId,
             p.project_name AS projectName,
             p.client_name AS clientName,
             p.technology_stack AS technologyStack,
             p.complexity,
             p.estimated_team_size AS estimatedTeamSize,
             p.planned_effort AS plannedEffort,
             p.approved_data AS draftData,
             p.status,
             p.workflow_status AS workflowStatus,
             p.submitted_by_user_id AS submittedByUserId,
             (SELECT manager_id FROM app_user WHERE user_id = p.submitted_by_user_id AND organization_id = p.organization_id) AS submittedByManagerId,
             (SELECT manager_id FROM app_user WHERE user_id = p.owner_id AND organization_id = p.organization_id) AS ownerManagerId,
             p.approved_by_user_id AS approvedByUserId,
             p.submitted_at AS submittedAt,
             p.approved_at AS approvedAt,
             p.latest_comment AS latestComment,
             p.created_at AS createdAt,
             p.updated_at AS updatedAt,
             COALESCE(p.is_regression_data, 0) AS isRegressionData
      FROM project p
      WHERE p.project_id = ?
        AND p.organization_id = ?
        AND p.source_draft_id IS NULL
        ${ownerClause}
        AND COALESCE(p.is_regression_data, 0) = 0
      LIMIT 1
    `,
    params,
  );
  return rows.length ? mapLifecycleProjectRow(rows[0]) : null;
}

async function transitionLifecycleProjectInTransaction(connection, projectId, transition, user, comment) {
  const organizationId = TenantContext.getOrganizationId();
  const fields = ['workflow_status = ?', 'status = ?', 'latest_comment = ?', 'updated_at = NOW()'];
  const values = [transition.toStatus, transition.toStatus, comment];

  if (transition.actionType === 'SUBMIT' || transition.actionType === 'RESUBMIT') {
    fields.push('submitted_by_user_id = ?', 'submitted_at = NOW()');
    values.push(user.userId);
  }

  if (transition.actionType === 'APPROVE') {
    fields.push('approved_by_user_id = ?', 'approved_at = NOW()');
    values.push(user.userId);
  }

  const [result] = await connection.query(
    `
      UPDATE project
      SET ${fields.join(', ')}
      WHERE project_id = ?
        AND organization_id = ?
        AND source_draft_id IS NULL
        AND workflow_status = ?
        AND COALESCE(is_regression_data, 0) = 0
    `,
    [...values, projectId, organizationId, transition.fromStatus],
  );

  if (result.affectedRows === 0) {
    const error = new Error('Project workflow state changed before transition could be saved');
    error.status = 409;
    throw error;
  }

  await connection.query(
    `
      INSERT INTO project_workflow_history
        (organization_id, project_id, from_status, to_status, action_by_user_id, action_by_role, action_comment, action_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      organizationId,
      projectId,
      transition.fromStatus,
      transition.toStatus,
      user.userId,
      String(user.role || '').toUpperCase() === 'AM' ? 'ACCOUNT_MANAGER' : String(user.role || '').toUpperCase(),
      comment,
      transition.actionType,
    ],
  );
}

async function getDraftById(draftId, ownerId) {
  await ensureDraftTable();
  const organizationId = TenantContext.getOrganizationId();
  const sql = `
    SELECT draft_id AS draftId,
           organization_id AS organizationId,
           owner_id AS ownerId,
           draft_data AS draftData,
           status,
           workflow_status AS workflowStatus,
           submitted_by_user_id AS submittedByUserId,
           (SELECT manager_id FROM app_user WHERE user_id = submitted_by_user_id AND organization_id = project_drafts.organization_id) AS submittedByManagerId,
           (SELECT manager_id FROM app_user WHERE user_id = owner_id AND organization_id = project_drafts.organization_id) AS ownerManagerId,
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
    WHERE draft_id = ? AND owner_id = ? AND organization_id = ?
      AND COALESCE(is_regression_data, 0) = 0
    LIMIT 1
  `;
  const [rows] = await db.promise().query(sql, [draftId, ownerId, organizationId]);
  if (!rows.length) {
    return null;
  }

  return {
  ...rows[0],
  organizationId: rows[0].organizationId,
  draftData: parseDraftData(rows[0].draftData),
  };

}

async function markDraftSubmitted(draftId, ownerId) {
  await ensureDraftTable();
  const organizationId = TenantContext.getOrganizationId();
  const sql = `
    UPDATE project_drafts
    SET status = 'SUBMITTED', updated_at = NOW()
    WHERE draft_id = ? AND owner_id = ? AND organization_id = ?
      AND COALESCE(is_regression_data, 0) = 0
  `;
  const [result] = await db.promise().query(sql, [draftId, ownerId, organizationId]);
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
  const technologyData = draftData.technology || {};

  return {
    projectId: row.projectId,
    id: row.projectId,
    organizationId: row.organizationId,
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
    name: row.projectName || legacy.name || basicInfo.project_name || 'Untitled Project',
    business_unit: row.clientName || legacy.business_unit || basicInfo.client_name || 'Unknown Client',
    industry: row.industry || legacy.industry || basicInfo.industry || '',
    industryCode: row.industryCode || basicInfo.industry_code || '',
    delivery_model: row.deliveryModel || basicInfo.delivery_model || '',
    business_criticality: row.businessCriticality || basicInfo.business_criticality || '',
    deliveryDetails: draftData.deliveryDetails || {
      start_date: row.startDate || '',
      planned_end_date: row.plannedEndDate || '',
    },
    billing_model: row.billingModel || (draftData.financial || {}).billing_model || '',
    technology: {
      technology_stack: row.technologyStack || legacy.technology || technologyData.technology_stack || 'Unknown',
      architecture_type: row.architectureType || technologyData.architecture_type || '',
      cloud_platform: row.cloudPlatform || technologyData.cloud_platform || '',
      complexity: row.complexity ?? (legacy.complexity || technologyData.complexity || 0),
    },
    complexity: row.complexity ?? (legacy.complexity || technologyData.complexity || 0),
    team_size: row.estimatedTeamSize ?? (legacy.team_size || (draftData.financial || {}).estimated_team_size || 0),
    estimated_hours: row.plannedEffort ?? (legacy.estimated_hours || (draftData.financial || {}).planned_effort || 0),
    avg_experience: legacy.avg_experience || 0,
    technology_score: legacy.technology_score || technologyData.integration_count || 0,
    draftData,
  };
}

function mapLifecycleProjectRow(row) {
  const draftData = parseDraftData(row.draftData);
  const basicInfo = draftData.basicInfo || {};
  const technologyData = draftData.technology || {};

  return {
    projectId: row.projectId,
    id: row.projectId,
    organizationId: row.organizationId,
    draftId: row.projectId,
    sourceDraftId: row.sourceDraftId,
    recordType: row.recordType || 'PROJECT',
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
    isPublished: true,
    publishedProjectId: row.projectId,
    publishedAt: row.approvedAt,
    isRegressionData: Boolean(row.isRegressionData),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    name: row.projectName || basicInfo.project_name || 'Untitled Project',
    business_unit: row.clientName || basicInfo.client_name || 'Unknown Client',
    industry: row.industry || basicInfo.industry || '',
    industryCode: row.industryCode || basicInfo.industry_code || '',
    delivery_model: row.deliveryModel || basicInfo.delivery_model || '',
    business_criticality: row.businessCriticality || basicInfo.business_criticality || '',
    deliveryDetails: draftData.deliveryDetails || {
      start_date: row.startDate || '',
      planned_end_date: row.plannedEndDate || '',
    },
    billing_model: row.billingModel || (draftData.financial || {}).billing_model || '',
    technology: {
      technology_stack: row.technologyStack || technologyData.technology_stack || 'Unknown',
      architecture_type: row.architectureType || technologyData.architecture_type || '',
      cloud_platform: row.cloudPlatform || technologyData.cloud_platform || '',
      complexity: row.complexity || technologyData.complexity || 0,
    },
    complexity: row.complexity || technologyData.complexity || 0,
    team_size: row.estimatedTeamSize || (draftData.financial || {}).estimated_team_size || 0,
    estimated_hours: row.plannedEffort || (draftData.financial || {}).planned_effort || 0,
    avg_experience: 0,
    technology_score: technologyData.integration_count || 0,
    draftData,
  };
}

async function findProjects() {
  await ensureDraftTable();
  const organizationId = TenantContext.getOrganizationId();
  const query = `
    SELECT draft_id AS projectId,
           owner_id AS ownerId,
           draft_data AS draftData,
           status,
           workflow_status AS workflowStatus,
           submitted_by_user_id AS submittedByUserId,
           (SELECT manager_id FROM app_user WHERE user_id = submitted_by_user_id AND organization_id = project_drafts.organization_id) AS submittedByManagerId,
           (SELECT manager_id FROM app_user WHERE user_id = owner_id AND organization_id = project_drafts.organization_id) AS ownerManagerId,
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
    WHERE organization_id = ? AND workflow_status IN ('SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED')
    ORDER BY updated_at DESC
  `;
  const [rows] = await db.promise().query(query, [organizationId]);
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
  const organizationId = TenantContext.getOrganizationId();
  const where = ['p.organization_id = ?'];
  const params = [organizationId];

  if (actorRole === 'ACCOUNT_MANAGER') {
    where.push(`(
      EXISTS (
        SELECT 1
        FROM app_user assigned_pm
        WHERE assigned_pm.user_id = COALESCE(p.submitted_by_user_id, p.owner_id)
          AND assigned_pm.manager_id = ?
          AND assigned_pm.organization_id = p.organization_id
      )
      OR p.approved_by_user_id = ?
    )`);
    params.push(filters.userId, filters.userId);
    where.push("p.workflow_status <> 'DRAFT'");
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

function buildLifecycleProjectListWhere(filters) {
  const actorRoleRaw = String(filters.role || '').toUpperCase();
  const actorRole = actorRoleRaw === 'AM' ? 'ACCOUNT_MANAGER' : actorRoleRaw;
  const organizationId = TenantContext.getOrganizationId();
  const where = ['ap.organization_id = ?', 'ap.source_draft_id IS NULL'];
  const params = [organizationId];

  if (actorRole === 'ACCOUNT_MANAGER') {
    where.push(`(
      EXISTS (
        SELECT 1
        FROM app_user assigned_pm
        WHERE assigned_pm.user_id = COALESCE(ap.submitted_by_user_id, ap.owner_id)
          AND assigned_pm.manager_id = ?
          AND assigned_pm.organization_id = ap.organization_id
      )
      OR ap.approved_by_user_id = ?
    )`);
    params.push(filters.userId, filters.userId);
    where.push("ap.workflow_status <> 'DRAFT'");
  } else {
    where.push('(ap.submitted_by_user_id = ? OR ap.owner_id = ?)');
    params.push(filters.userId, filters.userId);
  }

  if (filters.search) {
    where.push(`(
      ap.project_name LIKE ?
      OR ap.client_name LIKE ?
      OR COALESCE(ap.project_code, CONCAT('PRJ-', LPAD(ap.project_id, 6, '0'))) LIKE ?
      OR CAST(ap.project_id AS CHAR) LIKE ?
    )`);
    const searchValue = `%${filters.search}%`;
    params.push(searchValue, searchValue, searchValue, searchValue);
  }

  if (filters.status) {
    where.push('ap.workflow_status = ?');
    params.push(filters.status);
  }

  if (filters.industry) {
    where.push('COALESCE(NULLIF(ap.industry, \'\'), ap.industry_code) = ?');
    params.push(filters.industry);
  }

  if (filters.deliveryModel) {
    where.push('ap.delivery_model = ?');
    params.push(filters.deliveryModel);
  }

  if (filters.createdFrom) {
    where.push('DATE(ap.created_at) >= ?');
    params.push(filters.createdFrom);
  }

  if (filters.createdTo) {
    where.push('DATE(ap.created_at) <= ?');
    params.push(filters.createdTo);
  }

  where.push('COALESCE(ap.is_regression_data, 0) = 0');

  return {
    sql: where.join(' AND '),
    params,
  };
}

function mapProjectListRow(row) {
  const currentStatus = row.currentStatus === 'COMPLETE' ? 'COMPLETED' : row.currentStatus;
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
    currentStatus: currentStatus || 'DRAFT',
    startDate: toDateOnly(row.startDate),
    plannedEndDate: toDateOnly(row.plannedEndDate),
    effectiveEndDate: toDateOnly(row.effectiveEndDate || row.endDate),
    approvedScheduleImpactDays: normalizeNumber(row.approvedScheduleImpactDays, 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    reviewerComment: row.reviewerComment || '-',
    severity: row.severity || 'Not Measured',
    canEdit: row.recordType !== 'APPROVED_PROJECT' && ['DRAFT', 'RETURNED', 'REJECTED'].includes(currentStatus),
    canCreateCr: row.recordType === 'APPROVED_PROJECT' && currentStatus === 'APPROVED',
    canComplete: row.recordType === 'APPROVED_PROJECT' && currentStatus === 'APPROVED',
    canTrackProgress: row.recordType === 'APPROVED_PROJECT' && currentStatus === 'APPROVED',
  };
}

async function findProjectsForPm(filters) {
  await ensureDraftTable();
  await ensureApprovedProjectTables();
  await ensureProjectProgressTables();

  const organizationId = TenantContext.getOrganizationId();
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
  const lifecycleWhere = buildLifecycleProjectListWhere(filters);

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
        INNER JOIN project_drafts p ON p.draft_id = ap.source_draft_id AND p.organization_id = ap.organization_id
        WHERE ${where.sql}
          AND p.is_published = 1
          AND COALESCE(ap.is_regression_data, 0) = 0
        UNION ALL
        SELECT ap.project_id
        FROM project ap
        WHERE ${lifecycleWhere.sql}
      ) records
    `,
    [...where.params, ...where.params, ...lifecycleWhere.params],
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
          WHERE action_by_role = 'ACCOUNT_MANAGER' AND organization_id = ?
          GROUP BY project_id
        ) latest
          ON latest.workflow_history_id = h.workflow_history_id
        WHERE h.organization_id = ?
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
                   (DATEDIFF(latest_progress.snapshot_date, ap.start_date) + 1)
                   / NULLIF(
                     (DATEDIFF(ap.planned_end_date, ap.start_date) + 1)
                     + COALESCE(cr_schedule.totalScheduleImpactDays, 0),
                     0
                   )
                 ) * 100)) - COALESCE(latest_progress.actual_completion_percent, 0)
               ) <= 10 THEN 'Normal'
               WHEN ABS(
                 LEAST(100, GREATEST(0, (
                   (DATEDIFF(latest_progress.snapshot_date, ap.start_date) + 1)
                   / NULLIF(
                     (DATEDIFF(ap.planned_end_date, ap.start_date) + 1)
                     + COALESCE(cr_schedule.totalScheduleImpactDays, 0),
                     0
                   )
                 ) * 100)) - COALESCE(latest_progress.actual_completion_percent, 0)
               ) <= 20 THEN 'Medium'
               WHEN ABS(
                 LEAST(100, GREATEST(0, (
                   (DATEDIFF(latest_progress.snapshot_date, ap.start_date) + 1)
                   / NULLIF(
                     (DATEDIFF(ap.planned_end_date, ap.start_date) + 1)
                     + COALESCE(cr_schedule.totalScheduleImpactDays, 0),
                     0
                   )
                 ) * 100)) - COALESCE(latest_progress.actual_completion_percent, 0)
               ) <= 40 THEN 'High'
               ELSE 'Urgent'
             END AS severity,
             ap.start_date AS startDate,
             ap.planned_end_date AS plannedEndDate,
             DATE_ADD(
               ap.planned_end_date,
               INTERVAL COALESCE(cr_schedule.totalScheduleImpactDays, 0) DAY
             ) AS effectiveEndDate,
             COALESCE(cr_schedule.totalScheduleImpactDays, 0) AS approvedScheduleImpactDays,
             ap.created_at AS createdAt,
             p.updated_at AS updatedAt,
             COALESCE(ap.is_regression_data, p.is_regression_data, 0) AS isRegressionData,
             reviewer.action_comment AS reviewerComment
      FROM project ap
      INNER JOIN project_drafts p ON p.draft_id = ap.source_draft_id AND p.organization_id = ap.organization_id
      LEFT JOIN (
        SELECT progress.*
        FROM project_progress_snapshot progress
        INNER JOIN (
          SELECT project_id, MAX(snapshot_date) AS snapshot_date
          FROM project_progress_snapshot
          WHERE organization_id = ?
          GROUP BY project_id
        ) latest
          ON latest.project_id = progress.project_id
         AND latest.snapshot_date = progress.snapshot_date
        WHERE progress.organization_id = ?
      ) latest_progress
        ON latest_progress.project_id = ap.project_id
      LEFT JOIN (
        SELECT project_id, SUM(schedule_impact_days) AS totalScheduleImpactDays
        FROM change_request
        WHERE workflow_status = 'APPROVED' AND organization_id = ?
        GROUP BY project_id
      ) cr_schedule
        ON cr_schedule.project_id = ap.project_id
      LEFT JOIN (
        SELECT h.project_id, h.action_comment
        FROM project_workflow_history h
        INNER JOIN (
          SELECT project_id, MAX(workflow_history_id) AS workflow_history_id
          FROM project_workflow_history
          WHERE action_by_role = 'ACCOUNT_MANAGER' AND organization_id = ?
          GROUP BY project_id
        ) latest
          ON latest.workflow_history_id = h.workflow_history_id
        WHERE h.organization_id = ?
      ) reviewer
        ON reviewer.project_id = p.draft_id
      WHERE ${where.sql}
        AND p.is_published = 1
        AND COALESCE(ap.is_regression_data, 0) = 0
      UNION ALL
      SELECT ap.project_id AS projectId,
             ap.project_id AS draftId,
             ap.project_id AS publishedProjectId,
             CASE WHEN ap.workflow_status IN ('APPROVED', 'ACTIVE', 'COMPLETED', 'COMPLETE') THEN 'APPROVED_PROJECT' ELSE 'PROJECT' END AS recordType,
             COALESCE(ap.project_code, CONCAT('PRJ-', LPAD(ap.project_id, 6, '0'))) AS projectCode,
             ap.project_name AS projectName,
             ap.client_name AS clientName,
             COALESCE(NULLIF(ap.industry, ''), ap.industry_code) AS industry,
             ap.delivery_model AS deliveryModel,
             CASE WHEN ap.workflow_status = 'COMPLETE' THEN 'COMPLETED' ELSE ap.workflow_status END AS currentStatus,
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
             ap.updated_at AS updatedAt,
             COALESCE(ap.is_regression_data, 0) AS isRegressionData,
             reviewer.action_comment AS reviewerComment
      FROM project ap
      LEFT JOIN (
        SELECT progress.*
        FROM project_progress_snapshot progress
        INNER JOIN (
          SELECT project_id, MAX(snapshot_date) AS snapshot_date
          FROM project_progress_snapshot
          WHERE organization_id = ?
          GROUP BY project_id
        ) latest
          ON latest.project_id = progress.project_id
         AND latest.snapshot_date = progress.snapshot_date
        WHERE progress.organization_id = ?
      ) latest_progress
        ON latest_progress.project_id = ap.project_id
      LEFT JOIN (
        SELECT project_id, SUM(schedule_impact_days) AS totalScheduleImpactDays
        FROM change_request
        WHERE workflow_status = 'APPROVED' AND organization_id = ?
        GROUP BY project_id
      ) cr_schedule
        ON cr_schedule.project_id = ap.project_id
      LEFT JOIN (
        SELECT h.project_id, h.action_comment
        FROM project_workflow_history h
        INNER JOIN (
          SELECT project_id, MAX(workflow_history_id) AS workflow_history_id
          FROM project_workflow_history
          WHERE action_by_role = 'ACCOUNT_MANAGER' AND organization_id = ?
          GROUP BY project_id
        ) latest
          ON latest.workflow_history_id = h.workflow_history_id
        WHERE h.organization_id = ?
      ) reviewer
        ON reviewer.project_id = ap.project_id
      WHERE ${lifecycleWhere.sql}
      ) project_rows
      ORDER BY ${sortColumn} ${sortOrder}, projectId DESC
      LIMIT ? OFFSET ?
    `,
    [
      organizationId,
      organizationId,
      ...where.params,
      organizationId,
      organizationId,
      organizationId,
      organizationId,
      organizationId,
      ...where.params,
      organizationId,
      organizationId,
      organizationId,
      organizationId,
      organizationId,
      ...lifecycleWhere.params,
      pageSize,
      offset,
    ],
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
  const organizationId = TenantContext.getOrganizationId();
  const rawRole = String(user.role || '').toUpperCase();
  const role = rawRole === 'AM' ? 'ACCOUNT_MANAGER' : rawRole;
  const params = [];
  const where = ['ap.organization_id = ?', 'pd.organization_id = ?'];
  const lifecycleParams = [];
  const lifecycleWhere = ['ap.organization_id = ?', 'ap.source_draft_id IS NULL'];

  if (role === 'PM') {
    where.push('(ap.owner_id = ? OR pd.submitted_by_user_id = ?)');
    params.push(user.userId, user.userId);
    lifecycleWhere.push('(ap.owner_id = ? OR ap.submitted_by_user_id = ?)');
    lifecycleParams.push(user.userId, user.userId);
  } else if (role === 'ACCOUNT_MANAGER') {
    where.push(`(
      EXISTS (
        SELECT 1
        FROM app_user assigned_pm
        WHERE assigned_pm.user_id = COALESCE(pd.submitted_by_user_id, ap.owner_id)
          AND assigned_pm.manager_id = ?
          AND assigned_pm.organization_id = ap.organization_id
      )
      OR ap.approved_by_user_id = ?
    )`);
    params.push(user.userId, user.userId);
    lifecycleWhere.push(`(
      EXISTS (
        SELECT 1
        FROM app_user assigned_pm
        WHERE assigned_pm.user_id = COALESCE(ap.submitted_by_user_id, ap.owner_id)
          AND assigned_pm.manager_id = ?
          AND assigned_pm.organization_id = ap.organization_id
      )
      OR ap.approved_by_user_id = ?
    )`);
    lifecycleParams.push(user.userId, user.userId);
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
      INNER JOIN project_drafts pd ON pd.draft_id = ap.source_draft_id AND pd.organization_id = ap.organization_id
      LEFT JOIN (
        SELECT project_id, SUM(schedule_impact_days) AS totalScheduleImpactDays
        FROM change_request
        WHERE workflow_status = 'APPROVED' AND organization_id = ?
        GROUP BY project_id
      ) cr_schedule
        ON cr_schedule.project_id = ap.project_id
      WHERE ${where.join(' AND ')}
        AND pd.workflow_status = 'APPROVED'
        AND COALESCE(ap.is_regression_data, 0) = 0
        AND COALESCE(pd.is_regression_data, 0) = 0
      ORDER BY ap.updated_at DESC, ap.project_id DESC
    `,
    [organizationId, organizationId, organizationId, ...params],
  );

  const [lifecycleRows] = await db.promise().query(
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
             ap.workflow_status AS currentStatus,
             'APPROVED_PROJECT' AS recordType,
             1 AS canCreateCr
      FROM project ap
      LEFT JOIN (
        SELECT project_id, SUM(schedule_impact_days) AS totalScheduleImpactDays
        FROM change_request
        WHERE workflow_status = 'APPROVED' AND organization_id = ?
        GROUP BY project_id
      ) cr_schedule
        ON cr_schedule.project_id = ap.project_id
      WHERE ${lifecycleWhere.join(' AND ')}
        AND ap.workflow_status IN ('APPROVED', 'ACTIVE')
        AND COALESCE(ap.is_regression_data, 0) = 0
      ORDER BY ap.updated_at DESC, ap.project_id DESC
    `,
    [organizationId, organizationId, ...lifecycleParams],
  );

  return [...rows, ...lifecycleRows].map((row) => ({
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
  const lifecycleProject = await getLifecycleProjectDraftById(projectId);
  if (lifecycleProject && ['SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED'].includes(String(lifecycleProject.workflowStatus || '').toUpperCase())) {
    return lifecycleProject;
  }

  await ensureDraftTable();
  const organizationId = TenantContext.getOrganizationId();
  const query = `
    SELECT draft_id AS projectId,
           organization_id AS organizationId,
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
    WHERE draft_id = ? AND organization_id = ? AND workflow_status IN ('SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED')
    LIMIT 1
  `;
  const [rows] = await db.promise().query(query, [projectId, organizationId]);
  if (!rows.length) {
    return null;
  }
  return mapDraftDataToProject(rows[0]);
}

async function getProjectById(projectId) {
  await ensureApprovedProjectTables();
  const organizationId = TenantContext.getOrganizationId();
  const query = `
        SELECT ap.project_id AS projectId,
           ap.organization_id AS organizationId,
           ap.source_draft_id AS sourceDraftId,
           ap.project_code AS projectCode,
           ap.owner_id AS ownerId,
           ap.project_name AS projectName,
          ap.client_name AS clientName,
          ap.technology_stack AS technologyStack,
          ap.complexity AS complexity,
          ap.industry AS industry,
          ap.industry_code AS industryCode,
          ap.delivery_model AS deliveryModel,
          ap.business_criticality AS businessCriticality,
          ap.architecture_type AS architectureType,
          ap.cloud_platform AS cloudPlatform,
          ap.start_date AS startDate,
          ap.planned_end_date AS plannedEndDate,
          ap.billing_model AS billingModel,
           ap.estimated_team_size AS estimatedTeamSize,
           ap.planned_effort AS plannedEffort,
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
           CASE
             WHEN ap.source_draft_id IS NULL THEN ap.workflow_status
             WHEN pd.workflow_status = 'COMPLETE' THEN 'COMPLETED'
             ELSE 'APPROVED'
           END AS status,
           CASE
             WHEN ap.source_draft_id IS NULL THEN ap.workflow_status
             WHEN pd.workflow_status = 'COMPLETE' THEN 'COMPLETED'
             ELSE 'APPROVED'
           END AS workflowStatus,
           COALESCE(ap.submitted_by_user_id, pd.submitted_by_user_id) AS submittedByUserId,
           (SELECT manager_id FROM app_user WHERE user_id = COALESCE(ap.submitted_by_user_id, pd.submitted_by_user_id) AND organization_id = ap.organization_id) AS submittedByManagerId,
           (SELECT manager_id FROM app_user WHERE user_id = ap.owner_id AND organization_id = ap.organization_id) AS ownerManagerId,
           ap.approved_by_user_id AS approvedByUserId,
           COALESCE(ap.submitted_at, pd.submitted_at) AS submittedAt,
           ap.approved_at AS approvedAt,
           COALESCE(ap.latest_comment, pd.latest_comment) AS latestComment,
           ap.created_at AS createdAt,
           COALESCE(ap.updated_at, pd.updated_at) AS updatedAt
           ,COALESCE(ap.is_regression_data, pd.is_regression_data, 0) AS isRegressionData
    FROM project ap
    LEFT JOIN project_drafts pd ON pd.draft_id = ap.source_draft_id AND pd.organization_id = ap.organization_id
    LEFT JOIN (
      SELECT project_id, SUM(schedule_impact_days) AS totalScheduleImpactDays
      FROM change_request
      WHERE workflow_status = 'APPROVED'
      GROUP BY project_id
    ) cr_schedule
      ON cr_schedule.project_id = ap.project_id
    WHERE ap.project_id = ? AND ap.organization_id = ?
    LIMIT 1
  `;
  const [rows] = await db.promise().query(query, [projectId, organizationId]);
  if (!rows.length) {
    return null;
  }
  const project = mapDraftDataToProject(rows[0]);

  // Fetch team snapshots if draftData is missing teamComposition
  if (!project.draftData?.teamComposition?.rows?.length) {
    const [teamRows] = await db.promise().query(
      `
        SELECT role_id AS roleId,
               role,
               location_type AS locationType,
               resource_count AS count,
               allocation_percent AS allocationPercent,
               allocation_start_date AS startDate,
               allocation_end_date AS endDate,
               rate_per_day AS ratePerDay,
               planned_effort AS plannedEffort,
               planned_cost AS plannedCost,
               avg_experience_years AS avgExperience,
               location
        FROM project_team_snapshot
        WHERE project_id = ?
      `,
      [projectId],
    );

    if (teamRows.length > 0) {
      project.draftData = {
        ...(project.draftData || {}),
        teamComposition: {
          rows: teamRows,
        },
      };
    } else {
      // Try fetching from completion history if snapshot is missing
      const [completionRows] = await db.promise().query(
        'SELECT final_resource_loading FROM project_completion_history WHERE project_id = ? LIMIT 1',
        [projectId],
      );
      if (completionRows.length > 0 && completionRows[0].final_resource_loading) {
        let team = [];
        try {
          team = typeof completionRows[0].final_resource_loading === 'string'
            ? JSON.parse(completionRows[0].final_resource_loading)
            : completionRows[0].final_resource_loading;
        } catch (e) {
          console.error('Failed to parse completion team loading', e);
        }
        if (team && team.length > 0) {
          project.draftData = {
            ...(project.draftData || {}),
            teamComposition: { rows: team },
          };
        }
      }
    }
  }

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
    startDate: rows[0].startDate,
    plannedEndDate: rows[0].plannedEndDate,
    billingModel: rows[0].billingModel,
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

function buildProjectPersistenceValues(data = {}, ownerId, approvedByUserId = null) {
  const basic = data.basicInfo || {};
  const technology = data.technology || {};
  const financial = data.financial || {};
  const delivery = data.deliveryDetails || {};
  const aiBaseline = extractAiBaseline(data);
  const pmEstimatedValue = extractPmEstimatedValue(data);
  const aiEstimatedValue = extractAiEstimatedValue(data);
  const pmBaseline = {
    effort: normalizeNumber(financial.planned_effort, 0),
    budget: normalizeNumber(financial.budget, 0),
    teamSize: normalizeNumber(financial.estimated_team_size, 0),
  };
  const projectName = String(basic.project_name || '').trim();
  const clientName = String(basic.client_name || '').trim();

  return {
    ownerId,
    projectName: projectName || 'Untitled Project',
    clientName,
    industry: basic.industry || '',
    industryCode: basic.industry_code || basic.industryCode || '',
    projectType: basic.project_type || '',
    deliveryModel: basic.delivery_model || '',
    businessCriticality: basic.business_criticality || '',
    technologyStack: technology.technology_stack || '',
    architectureType: technology.architecture_type || '',
    cloudPlatform: technology.cloud_platform || '',
    complexity: normalizeNumber(technology.complexity, 0),
    estimatedTeamSize: pmBaseline.teamSize,
    plannedEffort: pmBaseline.effort,
    budget: pmBaseline.budget,
    billingModel: financial.billing_model || '',
    startDate: toDateOnly(delivery.start_date),
    plannedEndDate: toDateOnly(delivery.planned_end_date),
    pmEstimatedValue,
    aiEstimatedValue,
    actualFinalEstimatedValue: pmEstimatedValue,
    aiBaseline,
    pmBaseline,
    approvedData: JSON.stringify(data),
    approvedByUserId,
  };
}

async function findProgressSnapshots(projectId) {
  await ensureProjectProgressTables();
  const organizationId = TenantContext.getOrganizationId();
  const project = await getProjectById(projectId, organizationId);
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
      WHERE project_id = ? AND organization_id = ?
      ORDER BY snapshot_date DESC, snapshot_id DESC
    `,
    [projectId, organizationId],
  );
  return rows.map((row) => mapProgressSnapshot(row, project));
}

async function getProgressSnapshotByDate(projectId, snapshotDate) {
  await ensureProjectProgressTables();
  const organizationId = TenantContext.getOrganizationId();
  const project = await getProjectById(projectId, organizationId);
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
      WHERE project_id = ? AND snapshot_date = ? AND organization_id = ?
      LIMIT 1
    `,
    [projectId, snapshotDate, organizationId],
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
  const organizationId = TenantContext.getOrganizationId();
  await db.promise().query(
    `
      INSERT INTO project_progress_snapshot
        (organization_id, project_id, snapshot_date, actual_effort_pd, actual_budget, actual_team_size,
         actual_completion_percent, remarks, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        actual_effort_pd = VALUES(actual_effort_pd),
        actual_budget = VALUES(actual_budget),
        actual_team_size = VALUES(actual_team_size),
        actual_completion_percent = VALUES(actual_completion_percent),
        remarks = VALUES(remarks),
        updated_at = NOW()
    `,
    [
      organizationId,
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
  const organizationId = TenantContext.getOrganizationId();
  const [rows] = await connection.query(
    `
      SELECT ap.project_id AS projectId,
             ap.organization_id AS organizationId,
             ap.source_draft_id AS sourceDraftId,
             ap.owner_id AS ownerId,
             ap.project_name AS projectName,
             ap.project_code AS projectCode,
             ap.actual_final_estimated_value AS actualFinalEstimatedValue,
             ap.actual_completion_date AS actualCompletionDate,
             COALESCE(ap.submitted_by_user_id, pd.submitted_by_user_id) AS submittedByUserId,
             COALESCE(ap.approved_by_user_id, pd.approved_by_user_id) AS approvedByUserId,
             CASE
               WHEN ap.source_draft_id IS NULL THEN ap.workflow_status
               ELSE pd.workflow_status
             END AS workflowStatus
      FROM project ap
      LEFT JOIN project_drafts pd ON pd.draft_id = ap.source_draft_id AND pd.organization_id = ap.organization_id
      WHERE ap.project_id = ? AND ap.organization_id = ?
      FOR UPDATE
    `,
    [projectId, organizationId],
  );
  return rows[0] || null;
}

async function insertProjectCompletion(connection, completion) {
  const organizationId = TenantContext.getOrganizationId();
  const [result] = await connection.query(
    `
      INSERT INTO project_completion_history
        (organization_id, project_id, source_draft_id, completed_by_user_id, final_resource_loading,
         management_cost, contingency_cost, resource_cost, full_project_cost,
         dependency_count, requirement_stability_index, actual_cr_volatility,
         risk_level_indicators, actual_final_estimated_value, actual_completion_date, completion_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      organizationId,
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
      organizationId,
      result.insertId,
      completion.projectId,
      row.role || row.roleName || 'Unknown',
      row.location || row.locationType || 'OFFSHORE',
      row.count || 0,
      row.rate || row.ratePerDay || 0,
      row.effort || row.plannedEffort || 0,
      row.actualCost || row.plannedCost || 0,
    ]);
    await connection.query(
      `
        INSERT INTO project_completion_resource_loading
          (organization_id, completion_id, project_id, role, location, resource_count, rate, effort, actual_cost)
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
  if (!draftId) {
    const [projectResult] = await connection.query(
      `
        UPDATE project
        SET status = 'COMPLETED',
            workflow_status = 'COMPLETED',
            latest_comment = ?,
            updated_at = NOW()
        WHERE project_id = ? AND workflow_status IN ('APPROVED', 'ACTIVE')
      `,
      [comment, projectId],
    );

    if (projectResult.affectedRows === 0) {
      return false;
    }

    await connection.query(
      `
        INSERT INTO project_workflow_history
          (project_id, organization_id, from_status, to_status, action_by_user_id, action_by_role, action_comment, action_type)
        VALUES (?, ?, 'APPROVED', 'COMPLETED', ?, ?, ?, 'COMPLETE')
      `,
      [projectId, user.organizationId, user.userId, String(user.role || '').toUpperCase(), comment],
    );

    return true;
  }

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
        (project_id, organization_id, from_status, to_status, action_by_user_id, action_by_role, action_comment, action_type)
      VALUES (?, ?, 'APPROVED', 'COMPLETE', ?, ?, ?, 'COMPLETE')
    `,
    [projectId, user.organizationId, user.userId, String(user.role || '').toUpperCase(), comment],
  );

  return true;
}

async function getDraftProjectById(draftId) {
  await ensureDraftTable();
  const organizationId = TenantContext.getOrganizationId();
  const query = `
    SELECT draft_id AS projectId,
           organization_id AS organizationId,
           owner_id AS ownerId,
           draft_data AS draftData,
           status,
           workflow_status AS workflowStatus,
           submitted_by_user_id AS submittedByUserId,
           (SELECT manager_id FROM app_user WHERE user_id = submitted_by_user_id AND organization_id = project_drafts.organization_id) AS submittedByManagerId,
           (SELECT manager_id FROM app_user WHERE user_id = owner_id AND organization_id = project_drafts.organization_id) AS ownerManagerId,
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
    WHERE draft_id = ? AND organization_id = ?
    LIMIT 1
  `;
  const [rows] = await db.promise().query(query, [draftId, organizationId]);
  if (!rows.length) return null;
  return mapDraftDataToProject(rows[0]);
}
async function getDraftForPublishing(connection, draftId) {
  const [rows] = await connection.query(
    `
      SELECT draft_id AS draftId,
             organization_id AS organizationId,
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
  const organizationId = draft.organizationId || TenantContext.getOrganizationId();
  if (!organizationId) {
    const error = new Error('Organization context is required to publish approved project');
    error.status = 400;
    throw error;
  }
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
        (organization_id, source_draft_id, owner_id, project_name, client_name, industry, industry_code, project_type, delivery_model,
         business_criticality, technology_stack, architecture_type, cloud_platform, complexity, estimated_team_size, planned_effort, budget, 
         billing_model, start_date, planned_end_date, predicted_hours,
         pm_estimated_value, ai_estimated_value, actual_final_estimated_value,
         ai_baseline_effort, ai_baseline_budget, ai_baseline_team_size,
         pm_baseline_effort, pm_baseline_budget, pm_baseline_team_size,
         current_planned_effort, current_planned_budget, current_planned_team_size,
         approved_data, approved_by_user_id, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      organizationId,
      draft.draftId,
      draft.ownerId,
      basic.project_name || 'Untitled Project',
      basic.client_name || '',
      basic.industry || '',
      basic.industry_code || basic.industryCode || '',
      basic.project_type || '',
      basic.delivery_model || '',
      basic.business_criticality || '',
      technology.technology_stack || '',
      technology.architecture_type || '',
      technology.cloud_platform || '',
      normalizeNumber(technology.complexity, 0),
      pmBaseline.teamSize,
      pmBaseline.effort,
      pmBaseline.budget,
      financial.billing_model || '',
      toDateOnly(data.deliveryDetails?.start_date),
      toDateOnly(data.deliveryDetails?.planned_end_date),
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

async function insertProjectTeamSnapshots(connection, projectId, teamRows = [], organizationId = null) {
  if (!Array.isArray(teamRows) || teamRows.length === 0) return;
  const orgId = organizationId || TenantContext.getOrganizationId();
  if (!orgId) {
    const error = new Error('Organization context is required to insert project team snapshots');
    error.status = 400;
    throw error;
  }
  const values = teamRows.map((row) => [
    orgId,
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
        (organization_id, project_id, role_id, role, location_type, resource_count, allocation_percent, allocation_start_date, allocation_end_date,
         rate_per_day, planned_effort, planned_cost, avg_experience_years, location)
      VALUES ?
    `,
    [values],
  );
}

async function insertProjectTeamSnapshotsIfMissing(connection, projectId, teamRows = [], organizationId = null) {
  const orgId = organizationId || TenantContext.getOrganizationId();
  if (!orgId) {
    const error = new Error('Organization context is required to insert project team snapshots');
    error.status = 400;
    throw error;
  }
  const [rows] = await connection.query(
    'SELECT COUNT(*) AS rowCount FROM project_team_snapshot WHERE project_id = ? AND organization_id = ?',
    [projectId, orgId],
  );
  if (Number(rows[0]?.rowCount || 0) > 0) return;
  await insertProjectTeamSnapshots(connection, projectId, teamRows, orgId);
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
  createLifecycleProjectDraft,
  updateLifecycleProjectDraft,
  getLifecycleProjectDraftById,
  transitionLifecycleProjectInTransaction,
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
  insertProjectTeamSnapshotsIfMissing,
  markProjectComplete,
  markDraftPublished,
  upsertProgressSnapshot,
  insertProject,
};
