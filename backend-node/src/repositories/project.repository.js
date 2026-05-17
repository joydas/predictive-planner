const { pool: db } = require('../config/db.config');

async function ensureDraftTable() {
  return true;
}

async function ensureApprovedProjectTables() {
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
    approvedByUserId: row.approvedByUserId,
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    latestComment: row.latestComment,
    isPublished: Boolean(row.isPublished),
    publishedProjectId: row.publishedProjectId,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    name: legacy.name || basicInfo.project_name || 'Untitled Project',
    business_unit: legacy.business_unit || basicInfo.client_name || 'Unknown Client',
    technology: legacy.technology || (draftData.technology || {}).technology_stack || 'Unknown',
    complexity: legacy.complexity || (draftData.technology || {}).complexity || 0,
    team_size: legacy.team_size || (draftData.financial || {}).estimated_team_size || 0,
    estimated_hours: legacy.estimated_hours || (draftData.financial || {}).planned_effort || 0,
    predicted_hours: draftData.predicted_hours || 0,
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
  projectName: "JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.project_name'))",
  name: "JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.project_name'))",
  status: 'p.workflow_status',
};

function buildProjectListWhere(filters) {
  const actorRole = String(filters.role || '').toUpperCase();
  const where = [];
  const params = [];

  if (actorRole === 'ACCOUNT_MANAGER') {
    where.push("(p.workflow_status = 'SUBMITTED' OR (p.workflow_status IN ('APPROVED', 'COMPLETE') AND p.approved_by_user_id = ?))");
    params.push(filters.userId);
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    reviewerComment: row.reviewerComment || '-',
    canEdit: row.recordType !== 'APPROVED_PROJECT' && ['DRAFT', 'RETURNED'].includes(row.currentStatus),
    canCreateCr: row.recordType === 'APPROVED_PROJECT' && row.currentStatus === 'APPROVED',
    canComplete: row.recordType === 'APPROVED_PROJECT' && row.currentStatus === 'APPROVED',
  };
}

async function findProjectsForPm(filters) {
  await ensureDraftTable();
  await ensureApprovedProjectTables();

  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 10));
  const offset = (page - 1) * pageSize;
  const sortColumn = PROJECT_SORT_COLUMNS[filters.sortBy] || PROJECT_SORT_COLUMNS.updatedAt;
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
             p.created_at AS createdAt,
             p.updated_at AS updatedAt,
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
             ap.industry AS industry,
             ap.delivery_model AS deliveryModel,
             CASE WHEN p.workflow_status = 'COMPLETE' THEN 'COMPLETE' ELSE 'APPROVED' END AS currentStatus,
             ap.created_at AS createdAt,
             p.updated_at AS updatedAt,
             reviewer.action_comment AS reviewerComment
      FROM project ap
      INNER JOIN project_drafts p ON p.draft_id = ap.source_draft_id
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
      ) project_rows
      ORDER BY updatedAt ${sortOrder}, projectId DESC
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
  await ensureApprovedProjectTables();
  const role = String(user.role || '').toUpperCase();
  const params = [];
  const where = [];

  if (role === 'PM') {
    where.push('(ap.owner_id = ? OR pd.submitted_by_user_id = ?)');
    params.push(user.userId, user.userId);
  } else if (role === 'ACCOUNT_MANAGER') {
    where.push('ap.approved_by_user_id = ?');
    params.push(user.userId);
  } else {
    return [];
  }

  const [rows] = await db.promise().query(
    `
      SELECT ap.project_id AS projectId,
             COALESCE(ap.project_code, CONCAT('PRJ-', LPAD(ap.project_id, 6, '0'))) AS projectCode,
             ap.project_name AS projectName,
             ap.client_name AS clientName,
             ap.industry,
             ap.delivery_model AS deliveryModel,
             CASE WHEN pd.workflow_status = 'COMPLETE' THEN 'COMPLETE' ELSE 'APPROVED' END AS currentStatus,
             'APPROVED_PROJECT' AS recordType,
             CASE WHEN pd.workflow_status = 'APPROVED' THEN 1 ELSE 0 END AS canCreateCr
      FROM project ap
      INNER JOIN project_drafts pd ON pd.draft_id = ap.source_draft_id
      WHERE ${where.join(' AND ')}
        AND pd.workflow_status = 'APPROVED'
      ORDER BY ap.updated_at DESC, ap.project_id DESC
    `,
    params,
  );

  return rows.map((row) => ({
    ...row,
    canCreateCr: Boolean(row.canCreateCr),
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
           CASE WHEN pd.workflow_status = 'COMPLETE' THEN 'COMPLETE' ELSE 'APPROVED' END AS status,
           CASE WHEN pd.workflow_status = 'COMPLETE' THEN 'COMPLETE' ELSE 'APPROVED' END AS workflowStatus,
           pd.submitted_by_user_id AS submittedByUserId,
           ap.approved_by_user_id AS approvedByUserId,
           pd.submitted_at AS submittedAt,
           ap.approved_at AS approvedAt,
           pd.latest_comment AS latestComment,
           ap.created_at AS createdAt,
           pd.updated_at AS updatedAt
    FROM project ap
    INNER JOIN project_drafts pd ON pd.draft_id = ap.source_draft_id
    WHERE ap.project_id = ?
    LIMIT 1
  `;
  const [rows] = await db.promise().query(query, [projectId]);
  if (!rows.length) {
    return null;
  }
  return mapDraftDataToProject(rows[0]);
}

async function getProjectForCompletion(connection, projectId) {
  const [rows] = await connection.query(
    `
      SELECT ap.project_id AS projectId,
             ap.source_draft_id AS sourceDraftId,
             ap.owner_id AS ownerId,
             ap.project_name AS projectName,
             ap.project_code AS projectCode,
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
         risk_level_indicators, completion_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  const [result] = await connection.query(
    `
      INSERT INTO project
        (source_draft_id, owner_id, project_name, client_name, industry, project_type, delivery_model,
         technology_stack, complexity, estimated_team_size, planned_effort, budget, predicted_hours,
         approved_data, approved_by_user_id, approved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      draft.draftId,
      draft.ownerId,
      basic.project_name || 'Untitled Project',
      basic.client_name || '',
      basic.industry || '',
      basic.project_type || '',
      basic.delivery_model || '',
      technology.technology_stack || '',
      Number(technology.complexity) || 0,
      Number(financial.estimated_team_size) || 0,
      Number(financial.planned_effort) || 0,
      Number(financial.budget) || 0,
      Number(data.predicted_hours) || 0,
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
  ensureDraftTable,
  getProjectForCompletion,
  insertProjectCompletion,
  insertApprovedProject,
  insertProjectTeamSnapshots,
  markProjectComplete,
  markDraftPublished,
  insertProject,
};
