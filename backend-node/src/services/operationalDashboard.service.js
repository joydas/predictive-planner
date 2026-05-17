const { pool } = require('../config/db.config');

const ACTIVE_PROJECT_STATUSES = ['APPROVED'];
const COMPLETED_PROJECT_STATUSES = ['COMPLETE', 'CLOSED'];

function normalizeRole(user) {
  return String(user?.role || '').toUpperCase();
}

function normalizePaging(query, prefix) {
  const page = Math.max(1, Number(query[`${prefix}Page`] || query.page) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(query[`${prefix}PageSize`] || query.pageSize) || 10));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function normalizeSearch(value) {
  return String(value || '').trim();
}

function visibleApprovedProjectWhere(user, alias = 'p', draftAlias = 'pd') {
  const role = normalizeRole(user);
  if (role === 'PM') {
    return {
      sql: `(${alias}.owner_id = ? OR ${draftAlias}.submitted_by_user_id = ?)`,
      params: [user.userId, user.userId],
    };
  }
  if (role === 'ACCOUNT_MANAGER') {
    return {
      sql: `${alias}.approved_by_user_id = ?`,
      params: [user.userId],
    };
  }
  return { sql: '1 = 0', params: [] };
}

function visibleDraftWorkflowWhere(user, alias = 'pd') {
  const role = normalizeRole(user);
  if (role === 'PM') {
    return {
      sql: `(${alias}.owner_id = ? OR ${alias}.submitted_by_user_id = ?)`,
      params: [user.userId, user.userId],
    };
  }
  if (role === 'ACCOUNT_MANAGER') {
    return {
      sql: `${alias}.workflow_status = 'SUBMITTED'`,
      params: [],
    };
  }
  return { sql: '1 = 0', params: [] };
}

function projectSearchWhere(search, aliases = { project: 'p' }) {
  if (!search) return { sql: '', params: [] };
  const value = `%${search}%`;
  const projectAlias = aliases.project;
  const draftAlias = aliases.draft;
  if (projectAlias) {
    return {
      sql: `AND (
        ${projectAlias}.project_name LIKE ?
        OR ${projectAlias}.client_name LIKE ?
        OR ${projectAlias}.technology_stack LIKE ?
        OR COALESCE(${projectAlias}.project_code, CONCAT('PRJ-', LPAD(${projectAlias}.project_id, 6, '0'))) LIKE ?
      )`,
      params: [value, value, value, value],
    };
  }
  return {
    sql: `AND (
      JSON_UNQUOTE(JSON_EXTRACT(${draftAlias}.draft_data, '$.basicInfo.project_name')) LIKE ?
      OR JSON_UNQUOTE(JSON_EXTRACT(${draftAlias}.draft_data, '$.basicInfo.client_name')) LIKE ?
      OR CONCAT('PRJ-', LPAD(${draftAlias}.draft_id, 6, '0')) LIKE ?
    )`,
    params: [value, value, value],
  };
}

function crVisibilityWhere(user, crAlias = 'cr', projectAlias = 'p', draftAlias = 'pd', { includeSubmittedForAm = false } = {}) {
  const role = normalizeRole(user);
  if (role === 'PM') {
    return {
      sql: `(${projectAlias}.owner_id = ? OR ${draftAlias}.submitted_by_user_id = ?)`,
      params: [user.userId, user.userId],
    };
  }
  if (role === 'ACCOUNT_MANAGER') {
    if (includeSubmittedForAm) {
      return {
        sql: `(${projectAlias}.approved_by_user_id = ? OR ${crAlias}.workflow_status = 'SUBMITTED')`,
        params: [user.userId],
      };
    }
    return {
      sql: `${projectAlias}.approved_by_user_id = ?`,
      params: [user.userId],
    };
  }
  return { sql: '1 = 0', params: [] };
}

async function getKpis(user) {
  const visibility = visibleApprovedProjectWhere(user);
  const [rows] = await pool.promise().query(
    `
      SELECT
        SUM(CASE WHEN pd.workflow_status = 'APPROVED' THEN 1 ELSE 0 END) AS approvedProjects,
        SUM(CASE WHEN pd.workflow_status IN (?, ?) THEN 1 ELSE 0 END) AS completedProjects,
        SUM(CASE WHEN pd.workflow_status IN (?) THEN 1 ELSE 0 END) AS activeProjects,
        SUM(CASE WHEN pd.workflow_status = 'APPROVED' THEN COALESCE(p.current_planned_effort, 0) ELSE 0 END) AS totalPlannedEffort,
        SUM(CASE WHEN pd.workflow_status = 'APPROVED' THEN COALESCE(p.current_planned_team_size, 0) ELSE 0 END) AS totalResourceCount
      FROM project p
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
      WHERE ${visibility.sql}
    `,
    [...COMPLETED_PROJECT_STATUSES, ...ACTIVE_PROJECT_STATUSES, ...visibility.params],
  );

  const row = rows[0] || {};
  return {
    approvedProjects: Number(row.approvedProjects || 0),
    completedProjects: Number(row.completedProjects || 0),
    activeProjects: Number(row.activeProjects || 0),
    totalPlannedEffort: Number(row.totalPlannedEffort || 0),
    totalResourceCount: Number(row.totalResourceCount || 0),
  };
}

function mapProjectRow(row) {
  const actions = [];
  if (Number(row.pendingCrCount || 0) > 0) actions.push('CR Pending');
  if (row.plannedEndDate) actions.push('Pending Completion');
  if (actions.length === 0) actions.push('Action Required');

  return {
    projectId: row.projectId,
    projectCode: row.projectCode,
    projectName: row.projectName || 'Untitled Project',
    clientName: row.clientName || '-',
    technology: row.technology || '-',
    currentStatus: row.currentStatus || 'APPROVED',
    plannedEndDate: row.plannedEndDate,
    currentPlannedEffort: Number(row.currentPlannedEffort || 0),
    currentPlannedBudget: Number(row.currentPlannedBudget || 0),
    currentPlannedTeamSize: Number(row.currentPlannedTeamSize || 0),
    approvedCrCount: Number(row.approvedCrCount || 0),
    pendingCrCount: Number(row.pendingCrCount || 0),
    pendingActions: actions,
  };
}

async function getActiveProjects(user, query) {
  const paging = normalizePaging(query, 'activeProjects');
  const search = normalizeSearch(query.activeProjectsSearch || query.search);
  const visibility = visibleApprovedProjectWhere(user);
  const searchClause = projectSearchWhere(search);
  const params = [...visibility.params, ...ACTIVE_PROJECT_STATUSES, ...searchClause.params];

  const [countRows] = await pool.promise().query(
    `
      SELECT COUNT(*) AS totalRecords
      FROM project p
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
      WHERE ${visibility.sql}
        AND pd.workflow_status IN (?)
        ${searchClause.sql}
    `,
    params,
  );

  const [rows] = await pool.promise().query(
    `
      SELECT
        p.project_id AS projectId,
        COALESCE(p.project_code, CONCAT('PRJ-', LPAD(p.project_id, 6, '0'))) AS projectCode,
        p.project_name AS projectName,
        p.client_name AS clientName,
        p.technology_stack AS technology,
        pd.workflow_status AS currentStatus,
        JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.deliveryDetails.planned_end_date')) AS plannedEndDate,
        p.current_planned_effort AS currentPlannedEffort,
        p.current_planned_budget AS currentPlannedBudget,
        p.current_planned_team_size AS currentPlannedTeamSize,
        SUM(CASE WHEN cr.workflow_status = 'APPROVED' THEN 1 ELSE 0 END) AS approvedCrCount,
        SUM(CASE WHEN cr.workflow_status = 'SUBMITTED' THEN 1 ELSE 0 END) AS pendingCrCount
      FROM project p
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
      LEFT JOIN change_request cr ON cr.project_id = p.project_id
      WHERE ${visibility.sql}
        AND pd.workflow_status IN (?)
        ${searchClause.sql}
      GROUP BY p.project_id, pd.workflow_status
      ORDER BY p.updated_at DESC, p.project_id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, paging.pageSize, paging.offset],
  );

  const totalRecords = Number(countRows[0]?.totalRecords || 0);
  return {
    items: rows.map(mapProjectRow),
    page: paging.page,
    pageSize: paging.pageSize,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / paging.pageSize)),
  };
}

function workflowProjectStatusForRole(role) {
  return role === 'ACCOUNT_MANAGER' ? ['SUBMITTED'] : ['DRAFT', 'RETURNED'];
}

function workflowCrStatusForRole(role) {
  return role === 'ACCOUNT_MANAGER' ? ['SUBMITTED'] : ['DRAFT', 'RETURNED'];
}

function mapWorkflowRow(row) {
  const currentStatus = row.currentStatus || 'DRAFT';
  let actionRequired = 'Action Required';
  if (currentStatus === 'SUBMITTED') actionRequired = 'Pending Approval';
  if (currentStatus === 'RETURNED') actionRequired = 'Returned for Rework';
  if (currentStatus === 'DRAFT') actionRequired = 'Pending Submission';

  return {
    type: row.type,
    id: row.id,
    name: row.name || '-',
    submittedBy: row.submittedBy || '-',
    currentStatus,
    lastUpdated: row.lastUpdated,
    pendingSince: row.pendingSince,
    actionRequired,
  };
}

async function getWorkflowQueue(user, query) {
  const role = normalizeRole(user);
  const paging = normalizePaging(query, 'workflow');
  const search = normalizeSearch(query.workflowSearch || query.search);
  const projectVisibility = visibleDraftWorkflowWhere(user, 'pd');
  const projectSearch = projectSearchWhere(search, { draft: 'pd' });
  const crVisibility = crVisibilityWhere(user, 'cr', 'p', 'pd', { includeSubmittedForAm: true });
  const workflowProjectStatuses = workflowProjectStatusForRole(role);
  const workflowCrStatuses = workflowCrStatusForRole(role);
  const crSearchSql = search
    ? `AND (
        cr.cr_title LIKE ?
        OR COALESCE(cr.cr_code, CONCAT('CR-', LPAD(cr.cr_id, 6, '0'))) LIKE ?
        OR p.project_name LIKE ?
      )`
    : '';
  const crSearchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

  const countParams = [
    ...projectVisibility.params,
    ...workflowProjectStatuses,
    ...projectSearch.params,
    ...crVisibility.params,
    ...workflowCrStatuses,
    ...crSearchParams,
  ];
  const [countRows] = await pool.promise().query(
    `
      SELECT SUM(totalRecords) AS totalRecords
      FROM (
        SELECT COUNT(*) AS totalRecords
        FROM project_drafts pd
        WHERE ${projectVisibility.sql}
          AND pd.workflow_status IN (?)
          ${projectSearch.sql}
        UNION ALL
        SELECT COUNT(*) AS totalRecords
        FROM change_request cr
        INNER JOIN project p ON p.project_id = cr.project_id
        INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
        WHERE ${crVisibility.sql}
          AND cr.workflow_status IN (?)
          ${crSearchSql}
      ) counts
    `,
    countParams,
  );

  const [rows] = await pool.promise().query(
    `
      SELECT * FROM (
        SELECT
          'Project' AS type,
          pd.draft_id AS id,
          JSON_UNQUOTE(JSON_EXTRACT(pd.draft_data, '$.basicInfo.project_name')) AS name,
          submitter.user_name AS submittedBy,
          pd.workflow_status AS currentStatus,
          pd.updated_at AS lastUpdated,
          CASE
            WHEN pd.workflow_status = 'SUBMITTED' THEN COALESCE(pd.submitted_at, pd.updated_at, pd.created_at)
            ELSE COALESCE(pd.updated_at, pd.created_at)
          END AS pendingSince
        FROM project_drafts pd
        LEFT JOIN app_user submitter ON submitter.user_id = COALESCE(pd.submitted_by_user_id, pd.owner_id)
        WHERE ${projectVisibility.sql}
          AND pd.workflow_status IN (?)
          ${projectSearch.sql}
        UNION ALL
        SELECT
          'CR' AS type,
          cr.cr_id AS id,
          COALESCE(cr.cr_title, cr.cr_code, CONCAT('CR-', LPAD(cr.cr_id, 6, '0'))) AS name,
          submitter.user_name AS submittedBy,
          cr.workflow_status AS currentStatus,
          cr.updated_at AS lastUpdated,
          CASE
            WHEN cr.workflow_status = 'SUBMITTED' THEN COALESCE(cr.submitted_at, cr.updated_at, cr.created_at)
            ELSE COALESCE(cr.updated_at, cr.created_at)
          END AS pendingSince
        FROM change_request cr
        INNER JOIN project p ON p.project_id = cr.project_id
        INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
        LEFT JOIN app_user submitter ON submitter.user_id = cr.submitted_by_user_id
        WHERE ${crVisibility.sql}
          AND cr.workflow_status IN (?)
          ${crSearchSql}
      ) workflow_items
      ORDER BY lastUpdated DESC, id DESC
      LIMIT ? OFFSET ?
    `,
    [...countParams, paging.pageSize, paging.offset],
  );

  const totalRecords = Number(countRows[0]?.totalRecords || 0);
  return {
    items: rows.map(mapWorkflowRow),
    page: paging.page,
    pageSize: paging.pageSize,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / paging.pageSize)),
  };
}

async function getCrSnapshot(user) {
  const visibility = crVisibilityWhere(user, 'cr', 'p', 'pd', { includeSubmittedForAm: true });
  const [rows] = await pool.promise().query(
    `
      SELECT
        COUNT(*) AS totalCrCount,
        SUM(CASE WHEN cr.workflow_status = 'APPROVED' THEN 1 ELSE 0 END) AS approvedCrCount,
        SUM(CASE WHEN cr.workflow_status = 'SUBMITTED' THEN 1 ELSE 0 END) AS pendingCrCount,
        SUM(CASE WHEN cr.workflow_status IN ('RETURNED', 'REJECTED') THEN 1 ELSE 0 END) AS rejectedReturnedCrCount,
        SUM(CASE WHEN cr.workflow_status = 'APPROVED' THEN COALESCE(cr.effort_impact, 0) ELSE 0 END) AS cumulativeCrEffortImpact,
        SUM(CASE WHEN cr.workflow_status = 'APPROVED' THEN COALESCE(cr.budget_impact, 0) ELSE 0 END) AS cumulativeCrBudgetImpact
      FROM change_request cr
      INNER JOIN project p ON p.project_id = cr.project_id
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
      WHERE ${visibility.sql}
    `,
    visibility.params,
  );

  const row = rows[0] || {};
  return {
    totalCrCount: Number(row.totalCrCount || 0),
    approvedCrCount: Number(row.approvedCrCount || 0),
    pendingCrCount: Number(row.pendingCrCount || 0),
    rejectedReturnedCrCount: Number(row.rejectedReturnedCrCount || 0),
    cumulativeCrEffortImpact: Number(row.cumulativeCrEffortImpact || 0),
    cumulativeCrBudgetImpact: Number(row.cumulativeCrBudgetImpact || 0),
  };
}

async function getDashboard(user, query = {}) {
  const [kpis, activeProjects, workflowQueue, crSnapshot] = await Promise.all([
    getKpis(user),
    getActiveProjects(user, query),
    getWorkflowQueue(user, query),
    getCrSnapshot(user),
  ]);

  return {
    role: normalizeRole(user),
    kpis,
    activeProjects,
    workflowQueue,
    crSnapshot,
  };
}

module.exports = {
  getDashboard,
};
