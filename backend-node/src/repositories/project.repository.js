const { pool: db } = require('../config/db.config');
const { ensureWorkflowSchema } = require('../workflow/workflow.service');

async function columnExists(connection, tableName, columnName) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
  return rows.length > 0;
}

async function addColumnIfMissing(connection, tableName, columnName, columnDefinition) {
  if (!(await columnExists(connection, tableName, columnName))) {
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

async function ensureDraftTable(connection = null) {
  const activeConnection = connection || db.promise();
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS project_drafts (
      draft_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      owner_id BIGINT UNSIGNED NOT NULL,
      draft_data JSON NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (draft_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  await activeConnection.query(createTableSql);
  await ensureWorkflowSchema('PROJECT', activeConnection);
  await addColumnIfMissing(activeConnection, 'project_drafts', 'is_published', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing(activeConnection, 'project_drafts', 'published_project_id', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing(activeConnection, 'project_drafts', 'published_at', 'TIMESTAMP NULL DEFAULT NULL');
}

async function ensureApprovedProjectTables(connection = null) {
  const activeConnection = connection || db.promise();
  await activeConnection.query(`
    CREATE TABLE IF NOT EXISTS project (
      project_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      source_draft_id BIGINT UNSIGNED NOT NULL,
      owner_id BIGINT UNSIGNED NOT NULL,
      project_code VARCHAR(32) NULL,
      project_name VARCHAR(255) NOT NULL,
      client_name VARCHAR(255) NULL,
      industry VARCHAR(100) NULL,
      project_type VARCHAR(100) NULL,
      delivery_model VARCHAR(100) NULL,
      technology_stack VARCHAR(255) NULL,
      complexity DECIMAL(10,2) NULL DEFAULT 0,
      estimated_team_size DECIMAL(10,2) NULL DEFAULT 0,
      planned_effort DECIMAL(12,2) NULL DEFAULT 0,
      budget DECIMAL(14,2) NULL DEFAULT 0,
      predicted_hours DECIMAL(12,2) NULL DEFAULT 0,
      approved_data JSON NOT NULL,
      approved_by_user_id BIGINT UNSIGNED NULL,
      approved_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (project_id),
      UNIQUE KEY uq_project_source_draft (source_draft_id),
      INDEX idx_project_owner_id (owner_id),
      INDEX idx_project_approved_at (approved_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await addColumnIfMissing(activeConnection, 'project', 'source_draft_id', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing(activeConnection, 'project', 'owner_id', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing(activeConnection, 'project', 'project_code', 'VARCHAR(32) NULL');
  await addColumnIfMissing(activeConnection, 'project', 'project_name', 'VARCHAR(255) NULL');
  await addColumnIfMissing(activeConnection, 'project', 'client_name', 'VARCHAR(255) NULL');
  await addColumnIfMissing(activeConnection, 'project', 'industry', 'VARCHAR(100) NULL');
  await addColumnIfMissing(activeConnection, 'project', 'project_type', 'VARCHAR(100) NULL');
  await addColumnIfMissing(activeConnection, 'project', 'delivery_model', 'VARCHAR(100) NULL');
  await addColumnIfMissing(activeConnection, 'project', 'technology_stack', 'VARCHAR(255) NULL');
  await addColumnIfMissing(activeConnection, 'project', 'complexity', 'DECIMAL(10,2) NULL DEFAULT 0');
  await addColumnIfMissing(activeConnection, 'project', 'estimated_team_size', 'DECIMAL(10,2) NULL DEFAULT 0');
  await addColumnIfMissing(activeConnection, 'project', 'planned_effort', 'DECIMAL(12,2) NULL DEFAULT 0');
  await addColumnIfMissing(activeConnection, 'project', 'budget', 'DECIMAL(14,2) NULL DEFAULT 0');
  await addColumnIfMissing(activeConnection, 'project', 'predicted_hours', 'DECIMAL(12,2) NULL DEFAULT 0');
  await addColumnIfMissing(activeConnection, 'project', 'approved_data', 'JSON NULL');
  await addColumnIfMissing(activeConnection, 'project', 'approved_by_user_id', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing(activeConnection, 'project', 'approved_at', 'TIMESTAMP NULL DEFAULT NULL');
  await addColumnIfMissing(activeConnection, 'project', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
  await addColumnIfMissing(activeConnection, 'project', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

  await activeConnection.query(`
    CREATE TABLE IF NOT EXISTS project_team_snapshot (
      team_snapshot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      role VARCHAR(100) NULL,
      resource_count DECIMAL(10,2) NULL DEFAULT 0,
      avg_experience_years DECIMAL(10,2) NULL DEFAULT 0,
      location VARCHAR(100) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (team_snapshot_id),
      INDEX idx_project_team_snapshot_project (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await addColumnIfMissing(activeConnection, 'project_team_snapshot', 'project_id', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing(activeConnection, 'project_team_snapshot', 'role', 'VARCHAR(100) NULL');
  await addColumnIfMissing(activeConnection, 'project_team_snapshot', 'resource_count', 'DECIMAL(10,2) NULL DEFAULT 0');
  await addColumnIfMissing(activeConnection, 'project_team_snapshot', 'avg_experience_years', 'DECIMAL(10,2) NULL DEFAULT 0');
  await addColumnIfMissing(activeConnection, 'project_team_snapshot', 'location', 'VARCHAR(100) NULL');
  await addColumnIfMissing(activeConnection, 'project_team_snapshot', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
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
    where.push("(p.workflow_status = 'SUBMITTED' OR (p.workflow_status = 'APPROVED' AND p.approved_by_user_id = ?))");
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
          AND NOT (p.workflow_status = 'APPROVED' AND p.is_published = 1)
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
        AND NOT (p.workflow_status = 'APPROVED' AND p.is_published = 1)
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
             'APPROVED' AS currentStatus,
             ap.created_at AS createdAt,
             ap.updated_at AS updatedAt,
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
             'APPROVED' AS currentStatus,
             'APPROVED_PROJECT' AS recordType,
             1 AS canCreateCr
      FROM project ap
      INNER JOIN project_drafts pd ON pd.draft_id = ap.source_draft_id
      WHERE ${where.join(' AND ')}
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
           'APPROVED' AS status,
           'APPROVED' AS workflowStatus,
           pd.submitted_by_user_id AS submittedByUserId,
           ap.approved_by_user_id AS approvedByUserId,
           pd.submitted_at AS submittedAt,
           ap.approved_at AS approvedAt,
           pd.latest_comment AS latestComment,
           ap.created_at AS createdAt,
           ap.updated_at AS updatedAt
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
    row.role || '',
    Number(row.count) || 0,
    Number(row.avgExperience) || 0,
    row.location || '',
  ]);
  await connection.query(
    `
      INSERT INTO project_team_snapshot
        (project_id, role, resource_count, avg_experience_years, location)
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
  ensureDraftTable,
  insertApprovedProject,
  insertProjectTeamSnapshots,
  markDraftPublished,
  insertProject,
};
