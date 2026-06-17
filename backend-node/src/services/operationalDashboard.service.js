const { pool } = require('../config/db.config');
const forecastService = require('./forecastService');
const TenantContext = require('../utils/tenantContext');

const ACTIVE_PROJECT_STATUSES = ['APPROVED', 'ACTIVE'];
const COMPLETED_PROJECT_STATUSES = ['COMPLETED', 'COMPLETE', 'CLOSED'];
const PROGRESS_STALE_DAYS = 7;

function normalizeRole(user) {
  const role = String(user?.role || '').toUpperCase();
  return role === 'AM' ? 'ACCOUNT_MANAGER' : role;
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

function normalizeNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function getCalendarDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${toDateOnly(startDate)}T00:00:00`);
  const end = new Date(`${toDateOnly(endDate)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function expectedCompletionPercent(startDate, plannedEndDate, totalCrScheduleImpactDays, snapshotDate) {
  const plannedDuration = getCalendarDays(startDate, plannedEndDate) + normalizeNumber(totalCrScheduleImpactDays, 0);
  if (!plannedDuration || !startDate || !snapshotDate) return 0;
  const elapsed = getCalendarDays(startDate, snapshotDate);
  return Math.max(0, Math.min(100, (elapsed / plannedDuration) * 100));
}

function severityFromProgress(row) {
  if (!row.latestProgressDate) return 'Not Measured';
  const expected = expectedCompletionPercent(
    row.projectStartDate,
    row.plannedEndDate,
    row.totalCrScheduleImpactDays,
    row.latestProgressDate,
  );
  const variance = Math.abs(expected - normalizeNumber(row.actualCompletionPercent, 0));
  if (variance <= 10) return 'Normal';
  if (variance <= 20) return 'Medium';
  if (variance <= 40) return 'High';
  return 'Urgent';
}

function daysBetweenToday(value) {
  if (!value) return null;
  const date = new Date(`${toDateOnly(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.floor((todayDate.getTime() - date.getTime()) / 86400000));
}

function visibleApprovedProjectWhere(user, alias = 'p', draftAlias = 'pd') {
  const role = normalizeRole(user);
  const organizationId = TenantContext.getOrganizationId();
  const regressionFilter = role === 'ADMIN'
    ? ''
    : ` AND COALESCE(${alias}.is_regression_data, 0) = 0 AND COALESCE(${draftAlias}.is_regression_data, 0) = 0`;

  if (role === 'PM') {
    return {
      sql: `${alias}.organization_id = ? AND (${alias}.owner_id = ? OR COALESCE(${alias}.submitted_by_user_id, ${draftAlias}.submitted_by_user_id) = ?)${regressionFilter}`,
      params: [organizationId, user.userId, user.userId],
    };
  }

  if (role === 'ACCOUNT_MANAGER') {
    return {
      sql: `${alias}.organization_id = ? AND (
        ${alias}.approved_by_user_id = ?
        OR EXISTS (
          SELECT 1
          FROM app_user assigned_pm
          WHERE assigned_pm.user_id = COALESCE(${alias}.submitted_by_user_id, ${draftAlias}.submitted_by_user_id, ${alias}.owner_id)
            AND assigned_pm.manager_id = ?
            AND assigned_pm.organization_id = ${alias}.organization_id
        )
      )${regressionFilter}`,
      params: [organizationId, user.userId, user.userId],
    };
  }

  if (role === 'ADMIN') {
    return {
      sql: `${alias}.organization_id = ?`,
      params: [organizationId],
    };
  }

  return { sql: '1 = 0', params: [] };
}

function visibleDraftWorkflowWhere(user, alias = 'pd') {
  const role = normalizeRole(user);
  const organizationId = TenantContext.getOrganizationId();
  const regressionFilter = role === 'ADMIN' ? '' : ` AND COALESCE(${alias}.is_regression_data, 0) = 0`;

  if (role === 'PM') {
    return {
      sql: `${alias}.organization_id = ? AND (${alias}.owner_id = ? OR ${alias}.submitted_by_user_id = ?)${regressionFilter}`,
      params: [organizationId, user.userId, user.userId],
    };
  }

  if (role === 'ACCOUNT_MANAGER') {
    return {
      sql: `${alias}.organization_id = ? AND (
        ${alias}.workflow_status = 'SUBMITTED'
        AND EXISTS (
          SELECT 1
          FROM app_user assigned_pm
          WHERE assigned_pm.user_id = COALESCE(${alias}.submitted_by_user_id, ${alias}.owner_id)
            AND assigned_pm.manager_id = ?
            AND assigned_pm.organization_id = ${alias}.organization_id
        )
      )${regressionFilter}`,
      params: [organizationId, user.userId],
    };
  }

  if (role === 'ADMIN') {
    return {
      sql: `${alias}.organization_id = ?`,
      params: [organizationId],
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

function crVisibilityWhere(
  user,
  crAlias = 'cr',
  projectAlias = 'p',
  draftAlias = 'pd',
  { includeSubmittedForAm = false } = {},
) {
  const role = normalizeRole(user);
  const organizationId = TenantContext.getOrganizationId();
  const regressionFilter = role === 'ADMIN'
    ? ''
    : ` AND COALESCE(${crAlias}.is_regression_data, 0) = 0 AND COALESCE(${projectAlias}.is_regression_data, 0) = 0 AND COALESCE(${draftAlias}.is_regression_data, 0) = 0`;

  if (role === 'PM') {
    return {
      sql: `${crAlias}.organization_id = ? AND (${projectAlias}.owner_id = ? OR COALESCE(${projectAlias}.submitted_by_user_id, ${draftAlias}.submitted_by_user_id) = ?)${regressionFilter}`,
      params: [organizationId, user.userId, user.userId],
    };
  }

  if (role === 'ACCOUNT_MANAGER') {
    if (includeSubmittedForAm) {
      return {
        sql: `${crAlias}.organization_id = ? AND (
          ${projectAlias}.approved_by_user_id = ?
          OR (
            ${crAlias}.workflow_status = 'SUBMITTED'
            AND EXISTS (
              SELECT 1
              FROM app_user assigned_pm
              WHERE assigned_pm.user_id = ${crAlias}.submitted_by_user_id
                AND assigned_pm.manager_id = ?
                AND assigned_pm.organization_id = ${crAlias}.organization_id
            )
          )
        )${regressionFilter}`,
        params: [organizationId, user.userId, user.userId],
      };
    }

    return {
      sql: `${crAlias}.organization_id = ? AND (
        ${projectAlias}.approved_by_user_id = ?
        OR EXISTS (
          SELECT 1
          FROM app_user assigned_pm
          WHERE assigned_pm.user_id = ${crAlias}.submitted_by_user_id
            AND assigned_pm.manager_id = ?
            AND assigned_pm.organization_id = ${crAlias}.organization_id
        )
      )${regressionFilter}`,
      params: [organizationId, user.userId, user.userId],
    };
  }

  if (role === 'ADMIN') {
    return {
      sql: `${crAlias}.organization_id = ?`,
      params: [organizationId],
    };
  }

  return { sql: '1 = 0', params: [] };
}

async function getKpis(user) {
  const visibility = visibleApprovedProjectWhere(user);

  const [rows] = await pool.promise().query(
    `
      SELECT
        SUM(CASE WHEN COALESCE(p.workflow_status, pd.workflow_status) IN ('APPROVED', 'ACTIVE') THEN 1 ELSE 0 END) AS approvedProjects,
        SUM(CASE WHEN COALESCE(p.workflow_status, pd.workflow_status) IN ('COMPLETED', 'COMPLETE', 'CLOSED') THEN 1 ELSE 0 END) AS completedProjects,
        SUM(CASE WHEN COALESCE(p.workflow_status, pd.workflow_status) IN ('APPROVED', 'ACTIVE') THEN 1 ELSE 0 END) AS activeProjects,
        SUM(CASE WHEN COALESCE(p.workflow_status, pd.workflow_status) IN ('APPROVED', 'ACTIVE') THEN COALESCE(p.current_planned_effort, 0) ELSE 0 END) AS totalPlannedEffort,
        SUM(CASE WHEN COALESCE(p.workflow_status, pd.workflow_status) IN ('APPROVED', 'ACTIVE') THEN COALESCE(p.current_planned_team_size, 0) ELSE 0 END) AS totalResourceCount
      FROM project p
      LEFT JOIN project_drafts pd ON pd.draft_id = p.source_draft_id AND pd.organization_id = p.organization_id
      WHERE ${visibility.sql}
    `,
    [...visibility.params],
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
  const latestProgressAgeDays = daysBetweenToday(row.latestProgressDate);
  const hasProgress = Boolean(row.latestProgressDate);

  if (Number(row.pendingCrCount || 0) > 0) actions.push('CR Pending');
  if (!hasProgress) {
    actions.push('Progress Pending');
  } else if (latestProgressAgeDays !== null && latestProgressAgeDays > PROGRESS_STALE_DAYS) {
    actions.push('Progress Required');
  }

  if (actions.length === 0) actions.push('On Track');

  return {
    projectId: row.projectId,
    projectCode: row.projectCode,
    projectName: row.projectName || 'Untitled Project',
    clientName: row.clientName || '-',
    technology: row.technology || '-',
    currentStatus: row.currentStatus || 'APPROVED',
    plannedEndDate: row.plannedEndDate,
    latestProgressDate: row.latestProgressDate,
    actualCompletionPercent: hasProgress ? Number(row.actualCompletionPercent || 0) : null,
    severity: severityFromProgress(row),
    currentPlannedEffort: Number(row.currentPlannedEffort || 0),
    currentPlannedBudget: Number(row.currentPlannedBudget || 0),
    currentPlannedTeamSize: Number(row.currentPlannedTeamSize || 0),
    approvedCrCount: Number(row.approvedCrCount || 0),
    pendingCrCount: Number(row.pendingCrCount || 0),
    pendingActions: actions,
  };
}

function attachForecast(project, forecast) {
  return {
    ...project,
    forecast: forecast || { forecastAvailable: false },
  };
}

async function getActiveProjects(user, query) {
  const paging = normalizePaging(query, 'activeProjects');
  const search = normalizeSearch(query.activeProjectsSearch || query.search);

  const visibility = visibleApprovedProjectWhere(user);
  const searchClause = projectSearchWhere(search);

  const params = [
    ...visibility.params,
    ...searchClause.params,
  ];

  const [countRows] = await pool.promise().query(
    `
      SELECT COUNT(*) AS totalRecords
      FROM project p
      LEFT JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
      WHERE ${visibility.sql}
        AND COALESCE(p.workflow_status, pd.workflow_status) IN ('APPROVED', 'ACTIVE')
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
        COALESCE(p.workflow_status, pd.workflow_status) AS currentStatus,
        JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.deliveryDetails.start_date')) AS projectStartDate,
        JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.deliveryDetails.planned_end_date')) AS plannedEndDate,
        latest_progress.snapshot_date AS latestProgressDate,
        latest_progress.actual_completion_percent AS actualCompletionPercent,
        COALESCE(cr_schedule.totalScheduleImpactDays, 0) AS totalCrScheduleImpactDays,
        p.current_planned_effort AS currentPlannedEffort,
        p.current_planned_budget AS currentPlannedBudget,
        p.current_planned_team_size AS currentPlannedTeamSize,
        SUM(CASE WHEN cr.workflow_status = 'APPROVED' THEN 1 ELSE 0 END) AS approvedCrCount,
        SUM(CASE WHEN cr.workflow_status = 'SUBMITTED' THEN 1 ELSE 0 END) AS pendingCrCount
      FROM project p
      LEFT JOIN project_drafts pd ON pd.draft_id = p.source_draft_id AND pd.organization_id = p.organization_id
      LEFT JOIN change_request cr ON cr.project_id = p.project_id AND cr.organization_id = p.organization_id
      LEFT JOIN project_progress_snapshot latest_progress
        ON latest_progress.project_id = p.project_id AND latest_progress.organization_id = p.organization_id
      LEFT JOIN project_progress_snapshot newer_progress
        ON newer_progress.project_id = latest_progress.project_id AND newer_progress.organization_id = latest_progress.organization_id
       AND (
         newer_progress.snapshot_date > latest_progress.snapshot_date
         OR (
           newer_progress.snapshot_date = latest_progress.snapshot_date
           AND newer_progress.snapshot_id > latest_progress.snapshot_id
         )
       )
      LEFT JOIN (
        SELECT project_id, organization_id, SUM(schedule_impact_days) AS totalScheduleImpactDays
        FROM change_request
        WHERE workflow_status = 'APPROVED'
        GROUP BY project_id, organization_id
      ) cr_schedule
        ON cr_schedule.project_id = p.project_id AND cr_schedule.organization_id = p.organization_id
      WHERE ${visibility.sql}
        AND COALESCE(p.workflow_status, pd.workflow_status) IN ('APPROVED', 'ACTIVE')
        AND newer_progress.snapshot_id IS NULL
        ${searchClause.sql}
      GROUP BY p.project_id, COALESCE(p.workflow_status, pd.workflow_status)
      ORDER BY p.updated_at DESC, p.project_id DESC
      LIMIT ? OFFSET ?
    `,
    [...params, paging.pageSize, paging.offset],
  );

  const totalRecords = Number(countRows[0]?.totalRecords || 0);

  const items = rows.map(mapProjectRow);
  const forecasts = await forecastService.getForecastsForProjects(items.map((item) => item.projectId));

  return {
    items: items.map((item) => attachForecast(item, forecasts[item.projectId])),
    page: paging.page,
    pageSize: paging.pageSize,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / paging.pageSize)),
  };
}

function workflowProjectStatusForRole(role) {
  return role === 'ACCOUNT_MANAGER'
    ? ['SUBMITTED']
    : ['DRAFT', 'RETURNED'];
}

function workflowCrStatusForRole(role) {
  return role === 'ACCOUNT_MANAGER'
    ? ['SUBMITTED']
    : ['DRAFT', 'RETURNED'];
}

function mapWorkflowRow(row) {
  const currentStatus = row.currentStatus || 'DRAFT';
  const pendingSince = row.pendingSince;

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
    pendingSince,
    ageDays: daysBetweenToday(pendingSince),
    actionRequired,
  };
}

async function getWorkflowQueue(user, query) {
  const role = normalizeRole(user);

  const paging = normalizePaging(query, 'workflow');
  const search = normalizeSearch(query.workflowSearch || query.search);

  const projectVisibility = visibleDraftWorkflowWhere(user, 'pd');
  const projectSearch = projectSearchWhere(search, { draft: 'pd' });
  const directProjectVisibility = visibleApprovedProjectWhere(user, 'p', 'pd');
  const directProjectSearch = projectSearchWhere(search, { project: 'p' });

  const crVisibility = crVisibilityWhere(
    user,
    'cr',
    'p',
    'pd',
    { includeSubmittedForAm: true },
  );

  const workflowProjectStatuses = workflowProjectStatusForRole(role);
  const workflowCrStatuses = workflowCrStatusForRole(role);

  const workflowProjectPlaceholders = workflowProjectStatuses
    .map(() => '?')
    .join(',');

  const workflowCrPlaceholders = workflowCrStatuses
    .map(() => '?')
    .join(',');

  const crSearchSql = search
    ? `AND (
        cr.cr_title LIKE ?
        OR COALESCE(cr.cr_code, CONCAT('CR-', LPAD(cr.cr_id, 6, '0'))) LIKE ?
        OR p.project_name LIKE ?
      )`
    : '';

  const crSearchParams = search
    ? [`%${search}%`, `%${search}%`, `%${search}%`]
    : [];

  const countParams = [
    ...projectVisibility.params,
    ...workflowProjectStatuses,
    ...projectSearch.params,
    ...directProjectVisibility.params,
    ...workflowProjectStatuses,
    ...directProjectSearch.params,
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
          AND pd.workflow_status IN (${workflowProjectPlaceholders})
          ${projectSearch.sql}

        UNION ALL

        SELECT COUNT(*) AS totalRecords
        FROM project p
        LEFT JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
        WHERE p.source_draft_id IS NULL
          AND ${directProjectVisibility.sql}
          AND p.workflow_status IN (${workflowProjectPlaceholders})
          ${directProjectSearch.sql}

        UNION ALL

        SELECT COUNT(*) AS totalRecords
        FROM change_request cr
        INNER JOIN project p ON p.project_id = cr.project_id
        LEFT JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
        WHERE ${crVisibility.sql}
          AND cr.workflow_status IN (${workflowCrPlaceholders})
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

          COALESCE(project_history.lastActivityAt, pd.updated_at, pd.created_at) AS pendingSince

        FROM project_drafts pd

        LEFT JOIN app_user submitter
          ON submitter.user_id = COALESCE(pd.submitted_by_user_id, pd.owner_id)
          AND submitter.organization_id = pd.organization_id

        LEFT JOIN (
          SELECT project_id, organization_id, MAX(created_at) AS lastActivityAt
          FROM project_workflow_history
          GROUP BY project_id, organization_id
        ) project_history
          ON project_history.project_id = pd.draft_id
          AND project_history.organization_id = pd.organization_id

        WHERE ${projectVisibility.sql}
          AND pd.workflow_status IN (${workflowProjectPlaceholders})
          ${projectSearch.sql}

        UNION ALL

        SELECT
          'Project' AS type,
          p.project_id AS id,
          p.project_name AS name,
          submitter.user_name AS submittedBy,
          p.workflow_status AS currentStatus,
          p.updated_at AS lastUpdated,

          COALESCE(project_history.lastActivityAt, p.updated_at, p.created_at) AS pendingSince

        FROM project p

        LEFT JOIN project_drafts pd
          ON pd.draft_id = p.source_draft_id
          AND pd.organization_id = p.organization_id

        LEFT JOIN app_user submitter
          ON submitter.user_id = COALESCE(p.submitted_by_user_id, p.owner_id)
          AND submitter.organization_id = p.organization_id

        LEFT JOIN (
          SELECT project_id, organization_id, MAX(created_at) AS lastActivityAt
          FROM project_workflow_history
          GROUP BY project_id, organization_id
        ) project_history
          ON project_history.project_id = p.project_id
          AND project_history.organization_id = p.organization_id

        WHERE p.source_draft_id IS NULL
          AND ${directProjectVisibility.sql}
          AND p.workflow_status IN (${workflowProjectPlaceholders})
          ${directProjectSearch.sql}

        UNION ALL

        SELECT
          'CR' AS type,
          cr.cr_id AS id,
          COALESCE(cr.cr_title, cr.cr_code, CONCAT('CR-', LPAD(cr.cr_id, 6, '0'))) AS name,
          submitter.user_name AS submittedBy,
          cr.workflow_status AS currentStatus,
          cr.updated_at AS lastUpdated,

          COALESCE(cr_history.lastActivityAt, cr.updated_at, cr.created_at) AS pendingSince

        FROM change_request cr

        INNER JOIN project p
          ON p.project_id = cr.project_id
          AND p.organization_id = cr.organization_id

        LEFT JOIN project_drafts pd
          ON pd.draft_id = p.source_draft_id
          AND pd.organization_id = p.organization_id

        LEFT JOIN app_user submitter
          ON submitter.user_id = cr.submitted_by_user_id
          AND submitter.organization_id = cr.organization_id

        LEFT JOIN (
          SELECT cr_id, organization_id, MAX(created_at) AS lastActivityAt
          FROM cr_workflow_history
          GROUP BY cr_id, organization_id
        ) cr_history
          ON cr_history.cr_id = cr.cr_id
          AND cr_history.organization_id = cr.organization_id

        WHERE ${crVisibility.sql}
          AND cr.workflow_status IN (${workflowCrPlaceholders})
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
  const visibility = crVisibilityWhere(
    user,
    'cr',
    'p',
    'pd',
    { includeSubmittedForAm: true },
  );

  const [rows] = await pool.promise().query(
    `
      SELECT
        COUNT(*) AS totalCrCount,

        SUM(CASE
          WHEN cr.workflow_status = 'APPROVED'
          THEN 1 ELSE 0
        END) AS approvedCrCount,

        SUM(CASE
          WHEN cr.workflow_status = 'SUBMITTED'
          THEN 1 ELSE 0
        END) AS pendingCrCount,

        SUM(CASE
          WHEN cr.workflow_status IN ('RETURNED', 'REJECTED')
          THEN 1 ELSE 0
        END) AS rejectedReturnedCrCount,

        SUM(CASE
          WHEN cr.workflow_status = 'APPROVED'
          THEN COALESCE(cr.effort_impact, 0)
          ELSE 0
        END) AS cumulativeCrEffortImpact,

        SUM(CASE
          WHEN cr.workflow_status = 'APPROVED'
          THEN COALESCE(cr.budget_impact, 0)
          ELSE 0
        END) AS cumulativeCrBudgetImpact

      FROM change_request cr

      INNER JOIN project p
        ON p.project_id = cr.project_id
        AND p.organization_id = cr.organization_id

      LEFT JOIN project_drafts pd
        ON pd.draft_id = p.source_draft_id
        AND pd.organization_id = p.organization_id

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
  const [
    kpis,
    activeProjects,
    workflowQueue,
    crSnapshot,
  ] = await Promise.all([
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
