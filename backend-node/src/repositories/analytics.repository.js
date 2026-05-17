const { pool } = require('../config/db.config');

const db = pool.promise();

const TABLE_SORT_COLUMNS = {
  projectName: 'p.project_name',
  client: 'p.client_name',
  technology: 'p.technology_stack',
  pmName: 'pm.user_name',
  accountManagerName: 'am.user_name',
  aiBaselineEffort: 'p.ai_baseline_effort',
  pmBaselineEffort: 'p.pm_baseline_effort',
  currentPlannedEffort: 'p.current_planned_effort',
  actualEffort: 'p.actual_effort',
  aiBaselineBudget: 'p.ai_baseline_budget',
  pmBaselineBudget: 'p.pm_baseline_budget',
  currentPlannedBudget: 'p.current_planned_budget',
  actualBudget: 'p.actual_budget',
  aiBaselineTeamSize: 'p.ai_baseline_team_size',
  pmBaselineTeamSize: 'p.pm_baseline_team_size',
  currentPlannedTeamSize: 'p.current_planned_team_size',
  actualTeamSize: 'p.actual_team_size',
  approvedAt: 'p.approved_at',
};

async function getPmSummary(userId) {
  const [[projectCounts], [mlUsage], [overrideRows], [crRows]] = await Promise.all([
    db.query(
      `
        SELECT
          SUM(CASE WHEN workflow_status IN ('SUBMITTED', 'APPROVED') THEN 1 ELSE 0 END) AS activeProjects,
          SUM(CASE WHEN workflow_status = 'RETURNED' THEN 1 ELSE 0 END) AS returnedProjects
        FROM project_drafts
        WHERE owner_id = ? OR submitted_by_user_id = ?
      `,
      [userId, userId],
    ),
    db.query(
      `
        SELECT COUNT(*) AS mlRecommendationUsage
        FROM ml_prediction_log
        WHERE generated_by_user_id = ?
      `,
      [userId],
    ),
    db.query(
      `
        SELECT f.staffing_override_diff AS diff
        FROM ml_prediction_feedback f
        INNER JOIN project_drafts p ON p.draft_id = f.project_draft_id
        WHERE p.owner_id = ? OR p.submitted_by_user_id = ?
      `,
      [userId, userId],
    ),
    db.query(
      `
        SELECT DATE_FORMAT(cr.created_at, '%Y-%m') AS period, COUNT(*) AS count
        FROM change_request cr
        INNER JOIN project p ON p.project_id = cr.project_id
        INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
        WHERE pd.owner_id = ? OR pd.submitted_by_user_id = ?
        GROUP BY DATE_FORMAT(cr.created_at, '%Y-%m')
        ORDER BY period DESC
        LIMIT 6
      `,
      [userId, userId],
    ),
  ]);

  return {
    activeProjects: Number(projectCounts[0]?.activeProjects || 0),
    returnedProjects: Number(projectCounts[0]?.returnedProjects || 0),
    mlRecommendationUsage: Number(mlUsage[0]?.mlRecommendationUsage || 0),
    staffingOverrideCount: overrideRows.filter((row) => Object.keys(parseJson(row.diff)).length > 0).length,
    crTrends: crRows.reverse(),
  };
}

async function getAmSummary(userId) {
  const [[pending], [highRisk], [turnaround], [returns]] = await Promise.all([
    db.query('SELECT COUNT(*) AS pendingApprovals FROM project_drafts WHERE workflow_status = "SUBMITTED"'),
    db.query(
      `
        SELECT COUNT(*) AS highRiskProjects
        FROM project_drafts
        WHERE JSON_UNQUOTE(JSON_EXTRACT(draft_data, '$.mlRecommendation.recommendation.risk.riskLevel')) IN ('High', 'Critical')
      `,
    ),
    db.query(
      `
        SELECT AVG(TIMESTAMPDIFF(HOUR, submitted_at, approved_at)) AS approvalTurnaroundHours
        FROM project_drafts
        WHERE approved_by_user_id = ? AND submitted_at IS NOT NULL AND approved_at IS NOT NULL
      `,
      [userId],
    ),
    db.query(
      `
        SELECT project_id AS projectId, COUNT(*) AS returnCount
        FROM project_workflow_history
        WHERE action_type = 'RETURN'
        GROUP BY project_id
        ORDER BY returnCount DESC
        LIMIT 5
      `,
    ),
  ]);

  return {
    pendingApprovals: Number(pending[0]?.pendingApprovals || 0),
    highRiskProjects: Number(highRisk[0]?.highRiskProjects || 0),
    approvalTurnaroundHours: Number(turnaround[0]?.approvalTurnaroundHours || 0),
    mostReturnedProjects: returns,
  };
}

async function getMlAccuracy() {
  const [[logs], [feedback]] = await Promise.all([
    db.query(
      `
        SELECT prediction_response AS predictionResponse
        FROM ml_prediction_log
        ORDER BY created_at DESC
        LIMIT 500
      `,
    ),
    db.query(
      `
        SELECT f.final_effort AS finalEffort,
               f.actual_effort AS actualEffort,
               f.actual_schedule_variance AS actualScheduleVariance,
               f.staffing_override_diff AS staffingOverrideDiff,
               l.prediction_response AS predictionResponse
        FROM ml_prediction_feedback f
        LEFT JOIN ml_prediction_log l ON l.prediction_id = f.prediction_id
        ORDER BY f.feedback_created_at DESC
        LIMIT 500
      `,
    ),
  ]);

  const feedbackRows = feedback.map((row) => ({
    ...row,
    predictionResponse: parseJson(row.predictionResponse),
    staffingOverrideDiff: parseJson(row.staffingOverrideDiff),
  }));

  const effortSamples = feedbackRows
    .map((row) => {
      const predictedHours = Number(row.predictionResponse?.effort?.predictedHours || 0);
      const actualHours = Number(row.actualEffort || row.finalEffort * 8 || 0);
      if (!predictedHours || !actualHours) return null;
      return Math.max(0, 100 - (Math.abs(predictedHours - actualHours) / actualHours) * 100);
    })
    .filter((value) => value !== null);

  const staffingMatches = feedbackRows.map((row) => {
    const diffCount = Object.keys(row.staffingOverrideDiff || {}).length;
    return Math.max(0, 100 - diffCount * 10);
  });

  const riskSamples = feedbackRows
    .map((row) => {
      const risk = String(row.predictionResponse?.risk?.riskLevel || '').toUpperCase();
      const delayed = Number(row.actualScheduleVariance || 0) > 10;
      if (!risk || row.actualScheduleVariance === null) return null;
      return (['HIGH', 'CRITICAL'].includes(risk) === delayed) ? 100 : 0;
    })
    .filter((value) => value !== null);

  return {
    totalPredictions: logs.length,
    feedbackCount: feedbackRows.length,
    effortAccuracy: average(effortSamples),
    staffingMatch: average(staffingMatches),
    riskPredictionAccuracy: average(riskSamples),
    recentPredictions: logs.slice(0, 20).map((row) => parseJson(row.predictionResponse)),
  };
}

async function getProjectRisk() {
  const [rows] = await db.query(
    `
      SELECT p.draft_id AS projectId,
             JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.basicInfo.project_name')) AS projectName,
             p.workflow_status AS status,
             JSON_UNQUOTE(JSON_EXTRACT(p.draft_data, '$.mlRecommendation.recommendation.risk.riskLevel')) AS predictedRisk,
             COALESCE(cr.crCount, 0) AS crCount,
             COALESCE(ret.returnCount, 0) AS returnCount
      FROM project_drafts p
      LEFT JOIN project ap ON ap.source_draft_id = p.draft_id
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS crCount
        FROM change_request
        GROUP BY project_id
      ) cr ON cr.project_id = ap.project_id
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS returnCount
        FROM project_workflow_history
        WHERE action_type = 'RETURN'
        GROUP BY project_id
      ) ret ON ret.project_id = p.draft_id
      ORDER BY p.updated_at DESC
      LIMIT 100
    `,
  );

  return rows.map((row) => ({
    ...row,
    health: calculateHealth(row),
  }));
}

async function getCrTrends() {
  const [rows] = await db.query(
    `
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS period,
             COUNT(*) AS total,
             SUM(CASE WHEN severity IN ('High', 'Critical') THEN 1 ELSE 0 END) AS highSeverity,
             SUM(schedule_impact_days) AS scheduleImpactDays,
             SUM(estimated_effort_hours) AS effortHours
      FROM change_request
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY period DESC
      LIMIT 12
    `,
  );
  return rows.reverse();
}

async function getVarianceDashboard(user, options = {}) {
  const role = String(user.role || '').toUpperCase();
  if (!['PM', 'ACCOUNT_MANAGER', 'AM'].includes(role)) {
    const error = new Error('Variance analytics is available for PM and Account Manager roles');
    error.status = 403;
    throw error;
  }

  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(options.pageSize) || 10));
  const offset = (page - 1) * pageSize;
  const search = String(options.search || '').trim();
  const sortColumn = TABLE_SORT_COLUMNS[options.sortBy] || 'p.approved_at';
  const sortOrder = String(options.sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const scope = buildVarianceScope(user);
  const searchClause = search
    ? ` AND (
        p.project_name LIKE ?
        OR p.client_name LIKE ?
        OR p.technology_stack LIKE ?
        OR pm.user_name LIKE ?
        OR am.user_name LIKE ?
      )`
    : '';
  const searchParams = search ? Array(5).fill(`%${search}%`) : [];

  const scopedBaseFrom = `
    FROM project p
    INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
    LEFT JOIN app_user pm ON pm.user_id = p.owner_id
    LEFT JOIN app_user am ON am.user_id = p.approved_by_user_id
    WHERE pd.workflow_status IN ('APPROVED', 'COMPLETE')
      AND ${scope.sql}
  `;
  const tableBaseFrom = `
    ${scopedBaseFrom}
      ${searchClause}
  `;

  const [allRowsResult, countRowsResult, tableRowsResult] = await Promise.all([
    db.query(
      `
        SELECT ${varianceSelectFields()}
        ${scopedBaseFrom}
        ORDER BY p.project_name ASC, p.project_id ASC
      `,
      scope.params,
    ),
    db.query(
      `
        SELECT COUNT(*) AS totalRecords
        ${tableBaseFrom}
      `,
      [...scope.params, ...searchParams],
    ),
    db.query(
      `
        SELECT ${varianceSelectFields()}
        ${tableBaseFrom}
        ORDER BY ${sortColumn} ${sortOrder}, p.project_id DESC
        LIMIT ? OFFSET ?
      `,
      [...scope.params, ...searchParams, pageSize, offset],
    ),
  ]);

  const chartRows = allRowsResult[0].map(mapVarianceRow);
  const tableRows = tableRowsResult[0].map(mapVarianceRow);
  const totalRecords = Number(countRowsResult[0][0]?.totalRecords || 0);

  return {
    scope: {
      role,
      userId: user.userId,
    },
    widgets: buildVarianceWidgets(chartRows),
    table: {
      items: tableRows,
      page,
      pageSize,
      totalRecords,
      totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      sortBy: options.sortBy || 'approvedAt',
      sortOrder,
      search,
    },
  };
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function average(values) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length).toFixed(2));
}

function calculateHealth(row) {
  const risk = String(row.predictedRisk || '').toUpperCase();
  const crCount = Number(row.crCount || 0);
  const returnCount = Number(row.returnCount || 0);
  if (risk === 'CRITICAL' || crCount >= 5 || returnCount >= 2) return 'RED';
  if (risk === 'HIGH' || crCount >= 2 || returnCount >= 1) return 'AMBER';
  return 'GREEN';
}

function buildVarianceScope(user) {
  const role = String(user.role || '').toUpperCase();
  if (role === 'PM') {
    return {
      sql: '(p.owner_id = ? OR pd.submitted_by_user_id = ?)',
      params: [user.userId, user.userId],
    };
  }
  return {
    sql: 'p.approved_by_user_id = ?',
    params: [user.userId],
  };
}

function varianceSelectFields() {
  return `
    p.project_id AS projectId,
    p.project_name AS projectName,
    p.client_name AS client,
    p.technology_stack AS technology,
    pm.user_name AS pmName,
    am.user_name AS accountManagerName,
    p.ai_baseline_effort AS aiBaselineEffort,
    p.pm_baseline_effort AS pmBaselineEffort,
    p.current_planned_effort AS currentPlannedEffort,
    p.actual_effort AS actualEffort,
    p.ai_baseline_budget AS aiBaselineBudget,
    p.pm_baseline_budget AS pmBaselineBudget,
    p.current_planned_budget AS currentPlannedBudget,
    p.actual_budget AS actualBudget,
    p.ai_baseline_team_size AS aiBaselineTeamSize,
    p.pm_baseline_team_size AS pmBaselineTeamSize,
    p.current_planned_team_size AS currentPlannedTeamSize,
    p.actual_team_size AS actualTeamSize,
    COALESCE(p.total_cr_effort_impact, 0) AS totalCrEffortImpact,
    COALESCE(p.total_cr_budget_impact, 0) AS totalCrBudgetImpact,
    COALESCE(p.total_cr_team_impact, 0) AS totalCrTeamImpact,
    p.approved_at AS approvedAt
  `;
}

function mapVarianceRow(row) {
  const mapped = {
    projectId: row.projectId,
    projectName: row.projectName,
    client: row.client,
    technology: row.technology,
    pmName: row.pmName,
    accountManagerName: row.accountManagerName,
    aiBaselineEffort: toNullableNumber(row.aiBaselineEffort),
    pmBaselineEffort: toNullableNumber(row.pmBaselineEffort),
    currentPlannedEffort: toNullableNumber(row.currentPlannedEffort),
    actualEffort: toNullableNumber(row.actualEffort),
    aiBaselineBudget: toNullableNumber(row.aiBaselineBudget),
    pmBaselineBudget: toNullableNumber(row.pmBaselineBudget),
    currentPlannedBudget: toNullableNumber(row.currentPlannedBudget),
    actualBudget: toNullableNumber(row.actualBudget),
    aiBaselineTeamSize: toNullableNumber(row.aiBaselineTeamSize),
    pmBaselineTeamSize: toNullableNumber(row.pmBaselineTeamSize),
    currentPlannedTeamSize: toNullableNumber(row.currentPlannedTeamSize),
    actualTeamSize: toNullableNumber(row.actualTeamSize),
    totalCrEffortImpact: toNullableNumber(row.totalCrEffortImpact),
    totalCrBudgetImpact: toNullableNumber(row.totalCrBudgetImpact),
    totalCrTeamImpact: toNullableNumber(row.totalCrTeamImpact),
    approvedAt: row.approvedAt,
  };

  mapped.effortVariancePercent = calculateVariancePercent(mapped.actualEffort, mapped.pmBaselineEffort);
  mapped.budgetVariancePercent = calculateVariancePercent(mapped.actualBudget, mapped.pmBaselineBudget);
  mapped.teamSizeVariancePercent = calculateVariancePercent(mapped.actualTeamSize, mapped.pmBaselineTeamSize);
  mapped.varianceSeverity = calculateVarianceSeverity([
    mapped.effortVariancePercent,
    mapped.budgetVariancePercent,
    mapped.teamSizeVariancePercent,
  ]);

  return mapped;
}

function buildVarianceWidgets(rows) {
  const labels = rows.map((row) => row.projectName || `Project ${row.projectId}`);
  const aiVsActualEffort = buildAiVsActualWidget('Effort', rows, 'aiBaselineEffort', 'actualEffort');
  const aiVsActualBudget = buildAiVsActualWidget('Budget', rows, 'aiBaselineBudget', 'actualBudget');
  const aiVsActualTeamSize = buildAiVsActualWidget('Team Size', rows, 'aiBaselineTeamSize', 'actualTeamSize');

  return {
    effortVariance: {
      labels,
      datasets: [{ label: 'Effort Variance %', data: rows.map((row) => row.effortVariancePercent) }],
    },
    costVariance: {
      labels,
      datasets: [{ label: 'Cost Variance %', data: rows.map((row) => row.budgetVariancePercent) }],
    },
    teamSizeVariance: {
      labels,
      datasets: [{ label: 'Team Size Variance %', data: rows.map((row) => row.teamSizeVariancePercent) }],
    },
    aiVsActualEffort,
    aiVsActualBudget,
    aiVsActualTeamSize,
    aiVsActual: {
      labels: ['Effort', 'Budget', 'Team Size'],
      datasets: [
        {
          label: 'AI Predicted',
          data: [
            sumValues(rows, 'aiBaselineEffort'),
            sumValues(rows, 'aiBaselineBudget'),
            sumValues(rows, 'aiBaselineTeamSize'),
          ],
        },
        {
          label: 'Actual',
          data: [
            sumValues(rows, 'actualEffort'),
            sumValues(rows, 'actualBudget'),
            sumValues(rows, 'actualTeamSize'),
          ],
        },
      ],
    },
  };
}

function buildAiVsActualWidget(label, rows, aiKey, actualKey) {
  return {
    labels: [label],
    datasets: [
      {
        label: 'AI Predicted',
        data: [sumValues(rows, aiKey)],
      },
      {
        label: 'Actual',
        data: [sumValues(rows, actualKey)],
      },
    ],
  };
}

function calculateVariancePercent(actual, baseline) {
  const actualValue = Number(actual);
  const baselineValue = Number(baseline);
  if (!Number.isFinite(actualValue) || !Number.isFinite(baselineValue) || baselineValue === 0) {
    return null;
  }
  return Number((((actualValue - baselineValue) / baselineValue) * 100).toFixed(2));
}

function calculateVarianceSeverity(values) {
  const maxVariance = values
    .filter((value) => value !== null && Number.isFinite(Number(value)))
    .reduce((max, value) => Math.max(max, Math.abs(Number(value))), 0);

  if (maxVariance <= 10) return 'NORMAL';
  if (maxVariance <= 20) return 'MEDIUM';
  if (maxVariance <= 40) return 'HIGH';
  return 'URGENT';
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sumValues(rows, key) {
  const total = rows.reduce((sum, row) => {
    const value = Number(row[key]);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  return Number(total.toFixed(2));
}

module.exports = {
  getPmSummary,
  getAmSummary,
  getMlAccuracy,
  getProjectRisk,
  getCrTrends,
  getVarianceDashboard,
};
