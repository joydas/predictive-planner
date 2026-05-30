const { pool } = require('../config/db.config');
const projectRepository = require('./project.repository');

const db = pool.promise();

const TABLE_SORT_COLUMNS = {
  projectName: 'p.project_name',
  client: 'p.client_name',
  technology: 'p.technology_stack',
  pmName: 'pm.user_name',
  accountManagerName: 'am.user_name',
  severity: 'latest_progress.snapshot_date',
  progressPercent: 'latest_progress.actual_completion_percent',
  aiBaselineEffort: 'p.ai_baseline_effort',
  pmBaselineEffort: 'p.pm_baseline_effort',
  currentPlannedEffort: 'p.current_planned_effort',
  actualEffort: 'p.actual_effort',
  pmEstimatedValue: 'p.pm_estimated_value',
  aiEstimatedValue: 'p.ai_estimated_value',
  actualFinalEstimatedValue: 'p.actual_final_estimated_value',
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
  await projectRepository.ensureApprovedProjectTables();
  await projectRepository.ensureProjectProgressTables();
  const role = String(user.role || '').toUpperCase();
  if (!['PM', 'ACCOUNT_MANAGER', 'AM', 'ADMIN'].includes(role)) {
    const error = new Error('Analytics dashboard is available for PM, Account Manager, and Admin roles');
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
    LEFT JOIN project_progress_snapshot latest_progress
      ON latest_progress.project_id = p.project_id
    LEFT JOIN project_progress_snapshot newer_progress
      ON newer_progress.project_id = latest_progress.project_id
     AND (
       newer_progress.snapshot_date > latest_progress.snapshot_date
       OR (
         newer_progress.snapshot_date = latest_progress.snapshot_date
         AND newer_progress.snapshot_id > latest_progress.snapshot_id
       )
     )
    LEFT JOIN (
      SELECT project_id, SUM(schedule_impact_days) AS totalScheduleImpactDays
      FROM change_request
      WHERE workflow_status = 'APPROVED'
      GROUP BY project_id
    ) cr_schedule
      ON cr_schedule.project_id = p.project_id
    WHERE pd.workflow_status IN ('APPROVED', 'COMPLETE')
      AND newer_progress.snapshot_id IS NULL
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
  if (role === 'ADMIN') {
    return {
      sql: '1 = 1',
      params: [],
    };
  }
  return {
    sql: `(
      p.approved_by_user_id = ?
      OR EXISTS (
        SELECT 1
        FROM app_user assigned_pm
        WHERE assigned_pm.user_id = COALESCE(pd.submitted_by_user_id, p.owner_id)
          AND assigned_pm.manager_id = ?
      )
    )`,
    params: [user.userId, user.userId],
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
    p.pm_estimated_value AS pmEstimatedValue,
    p.ai_estimated_value AS aiEstimatedValue,
    p.actual_final_estimated_value AS actualFinalEstimatedValue,
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
    JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.deliveryDetails.start_date')) AS projectStartDate,
    JSON_UNQUOTE(JSON_EXTRACT(p.approved_data, '$.deliveryDetails.planned_end_date')) AS plannedEndDate,
    COALESCE(cr_schedule.totalScheduleImpactDays, 0) AS totalCrScheduleImpactDays,
    latest_progress.snapshot_date AS latestProgressDate,
    latest_progress.actual_completion_percent AS actualCompletionPercent,
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
    pmEstimatedValue: toNullableNumber(row.pmEstimatedValue),
    aiEstimatedValue: toNullableNumber(row.aiEstimatedValue),
    actualFinalEstimatedValue: toNullableNumber(row.actualFinalEstimatedValue),
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
    projectStartDate: toDateOnly(row.projectStartDate),
    plannedEndDate: toDateOnly(row.plannedEndDate),
    totalCrScheduleImpactDays: toNullableNumber(row.totalCrScheduleImpactDays) || 0,
    latestProgressDate: toDateOnly(row.latestProgressDate),
    actualCompletionPercent: toNullableNumber(row.actualCompletionPercent),
    approvedAt: row.approvedAt,
  };

  mapped.effortVariancePercent = calculateVariancePercent(mapped.actualEffort, mapped.pmBaselineEffort);
  mapped.estimationVariancePercent = calculateVariancePercent(mapped.aiEstimatedValue, mapped.pmEstimatedValue);
  mapped.finalEstimationVariancePercent = calculateVariancePercent(mapped.actualFinalEstimatedValue, mapped.pmEstimatedValue);
  mapped.budgetVariancePercent = calculateVariancePercent(mapped.actualBudget, mapped.pmBaselineBudget);
  mapped.teamSizeVariancePercent = calculateVariancePercent(mapped.actualTeamSize, mapped.pmBaselineTeamSize);
  mapped.expectedCompletionPercent = calculateExpectedCompletionPercent(mapped);
  mapped.progressVariancePercent = mapped.latestProgressDate
    ? Number(Math.abs((mapped.expectedCompletionPercent || 0) - (mapped.actualCompletionPercent || 0)).toFixed(2))
    : null;
  mapped.progressPercent = mapped.actualCompletionPercent;
  mapped.varianceSeverity = calculateProgressSeverity(mapped.progressVariancePercent, Boolean(mapped.latestProgressDate));
  mapped.severity = mapped.varianceSeverity;

  mapped.aiEffortAccuracy = calculateAccuracyPercent(mapped.aiBaselineEffort, mapped.actualEffort);
  mapped.pmEffortAccuracy = calculateAccuracyPercent(mapped.pmBaselineEffort, mapped.actualEffort);
  mapped.aiBudgetAccuracy = calculateAccuracyPercent(mapped.aiBaselineBudget, mapped.actualBudget);
  mapped.pmBudgetAccuracy = calculateAccuracyPercent(mapped.pmBaselineBudget, mapped.actualBudget);
  mapped.aiStaffingAccuracy = calculateAccuracyPercent(mapped.aiBaselineTeamSize, mapped.actualTeamSize);
  mapped.pmStaffingAccuracy = calculateAccuracyPercent(mapped.pmBaselineTeamSize, mapped.actualTeamSize);
  mapped.aiEstimationAccuracy = calculateAccuracyPercent(mapped.aiEstimatedValue, mapped.actualFinalEstimatedValue);
  mapped.pmEstimationAccuracy = calculateAccuracyPercent(mapped.pmEstimatedValue, mapped.actualFinalEstimatedValue);

  return mapped;
}

function buildVarianceWidgets(rows) {
  const labels = rows.map((row) => row.projectName || `Project ${row.projectId}`);
  const effortPredictionAccuracy = buildPredictionAccuracyWidget('Effort', rows, 'pmBaselineEffort', 'aiBaselineEffort', 'actualEffort');
  const budgetPredictionAccuracy = buildPredictionAccuracyWidget('Budget', rows, 'pmBaselineBudget', 'aiBaselineBudget', 'actualBudget');
  const staffingPredictionAccuracy = buildPredictionAccuracyWidget('Team Size', rows, 'pmBaselineTeamSize', 'aiBaselineTeamSize', 'actualTeamSize');
  const estimationComparison = {
    labels: ['Estimation'],
    datasets: [
      {
        label: 'PM Estimation',
        data: [sumValues(rows, 'pmEstimatedValue')],
      },
      {
        label: 'AI Estimation',
        data: [sumValues(rows, 'aiEstimatedValue')],
      },
      {
        label: 'Actual Final Estimation',
        data: [sumValues(rows, 'actualFinalEstimatedValue')],
      },
    ],
  };
  const severityOrder = ['Not Measured', 'Normal', 'Medium', 'High', 'Urgent'];
  const attentionRows = rows
    .filter((row) => ['Urgent', 'High', 'Medium', 'Not Measured'].includes(row.severity))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || Number(b.progressVariancePercent || 0) - Number(a.progressVariancePercent || 0))
    .slice(0, 8);

  return {
    predictionAccuracyKpis: {
      aiEffortAccuracy: averagePresent(rows.map((row) => row.aiEffortAccuracy)),
      pmEffortAccuracy: averagePresent(rows.map((row) => row.pmEffortAccuracy)),
      aiBudgetAccuracy: averagePresent(rows.map((row) => row.aiBudgetAccuracy)),
      pmBudgetAccuracy: averagePresent(rows.map((row) => row.pmBudgetAccuracy)),
      aiEstimationAccuracy: averagePresent(rows.map((row) => row.aiEstimationAccuracy)),
      pmEstimationAccuracy: averagePresent(rows.map((row) => row.pmEstimationAccuracy)),
      aiStaffingAccuracy: averagePresent(rows.map((row) => row.aiStaffingAccuracy)),
      pmStaffingAccuracy: averagePresent(rows.map((row) => row.pmStaffingAccuracy)),
      aiVsPmWinRate: calculateAiVsPmWinRate(rows),
    },
    effortPredictionAccuracy,
    budgetPredictionAccuracy,
    staffingPredictionAccuracy,
    estimationComparison,
    severityDistribution: {
      labels: severityOrder,
      datasets: [{
        label: 'Project Count',
        data: severityOrder.map((severity) => rows.filter((row) => row.severity === severity).length),
      }],
    },
    progressCompletionComparison: {
      labels,
      datasets: [
        {
          label: 'Expected Completion %',
          data: rows.map((row) => row.latestProgressDate ? row.expectedCompletionPercent : null),
        },
        {
          label: 'Actual Completion %',
          data: rows.map((row) => row.latestProgressDate ? row.actualCompletionPercent : null),
        },
      ],
    },
    projectsRequiringAttention: attentionRows.map((row) => ({
      projectId: row.projectId,
      projectName: row.projectName,
      severity: row.severity,
      progressVariancePercent: row.progressVariancePercent,
      latestProgressDate: row.latestProgressDate,
      reason: buildAttentionReason(row),
    })),
  };
}

function calculateAiVsPmWinRate(rows) {
  const dimensions = [
    ['Effort', 'pmBaselineEffort', 'aiBaselineEffort', 'actualEffort'],
    ['Budget', 'pmBaselineBudget', 'aiBaselineBudget', 'actualBudget'],
    ['Estimation', 'pmEstimatedValue', 'aiEstimatedValue', 'actualFinalEstimatedValue'],
    ['Staffing', 'pmBaselineTeamSize', 'aiBaselineTeamSize', 'actualTeamSize'],
  ];
  let aiWins = 0;
  let pmWins = 0;
  let ties = 0;
  const byDimension = dimensions.map(([label]) => ({
    label,
    aiWins: 0,
    pmWins: 0,
    ties: 0,
    totalDecisions: 0,
    aiOutperformedPercent: null,
    pmOutperformedPercent: null,
    tiePercent: null,
  }));
  const comparisons = [];

  rows.forEach((row) => {
    dimensions.forEach(([label, pmKey, aiKey, actualKey], index) => {
      const pmValue = toComparisonNumber(row[pmKey]);
      const aiValue = toComparisonNumber(row[aiKey]);
      const actualValue = toComparisonNumber(row[actualKey]);
      if (pmValue === null || aiValue === null || actualValue === null) return;

      const aiError = Math.abs(aiValue - actualValue);
      const pmError = Math.abs(pmValue - actualValue);
      byDimension[index].totalDecisions += 1;

      let winner = 'Tie';
      if (aiError < pmError) {
        aiWins += 1;
        byDimension[index].aiWins += 1;
        winner = 'AI';
      } else if (pmError < aiError) {
        pmWins += 1;
        byDimension[index].pmWins += 1;
        winner = 'PM';
      } else {
        ties += 1;
        byDimension[index].ties += 1;
      }

      comparisons.push({
        projectId: row.projectId,
        projectName: row.projectName || `Project ${row.projectId}`,
        metric: label,
        aiPrediction: aiValue,
        pmPrediction: pmValue,
        actual: actualValue,
        aiError: Number(aiError.toFixed(2)),
        pmError: Number(pmError.toFixed(2)),
        winner,
      });
    });
  });

  byDimension.forEach((dimension) => {
    if (!dimension.totalDecisions) return;
    const percentages = calculateWinPercentages(dimension.aiWins, dimension.pmWins, dimension.ties);
    dimension.aiOutperformedPercent = percentages.aiOutperformedPercent;
    dimension.pmOutperformedPercent = percentages.pmOutperformedPercent;
    dimension.tiePercent = percentages.tiePercent;
  });

  const totalDecisions = aiWins + pmWins + ties;
  const percentages = calculateWinPercentages(aiWins, pmWins, ties);
  return {
    aiOutperformedPercent: totalDecisions ? percentages.aiOutperformedPercent : null,
    pmOutperformedPercent: totalDecisions ? percentages.pmOutperformedPercent : null,
    tiePercent: totalDecisions ? percentages.tiePercent : null,
    aiWins,
    pmWins,
    ties,
    totalDecisions,
    byDimension,
    comparisons,
  };
}

function calculateWinPercentages(aiWins, pmWins, ties) {
  const total = aiWins + pmWins + ties;
  if (!total) {
    return {
      aiOutperformedPercent: null,
      pmOutperformedPercent: null,
      tiePercent: null,
    };
  }

  const aiOutperformedPercent = Number(((aiWins / total) * 100).toFixed(1));
  const pmOutperformedPercent = Number(((pmWins / total) * 100).toFixed(1));
  const tiePercent = Number(Math.max(0, 100 - aiOutperformedPercent - pmOutperformedPercent).toFixed(1));
  return {
    aiOutperformedPercent,
    pmOutperformedPercent,
    tiePercent,
  };
}

function toComparisonNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildAttentionReason(row) {
  if (!row.latestProgressDate) return 'No progress captured';

  const expected = Number(row.expectedCompletionPercent);
  const actual = Number(row.actualCompletionPercent);
  const variance = Number(row.progressVariancePercent);
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || !Number.isFinite(variance)) {
    return 'Progress data incomplete';
  }

  const roundedVariance = Math.round(variance);
  if (actual < expected) return `Progress lagging by ${roundedVariance}%`;
  if (actual > expected) return `Progress ahead by ${roundedVariance}%`;
  if (variance > 20) return 'High completion variance';
  return 'Completion variance requires review';
}

function buildPredictionAccuracyWidget(label, rows, pmKey, aiKey, actualKey) {
  return {
    labels: [label],
    datasets: [
      {
        label: 'PM Prediction',
        data: [sumValues(rows, pmKey)],
      },
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
  return 'CRITICAL';
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

function calculateExpectedCompletionPercent(row) {
  if (!row.latestProgressDate) return null;
  const plannedDuration = getCalendarDays(row.projectStartDate, row.plannedEndDate) + Number(row.totalCrScheduleImpactDays || 0);
  if (!plannedDuration) return null;
  const elapsed = getCalendarDays(row.projectStartDate, row.latestProgressDate);
  return Number(Math.max(0, Math.min(100, (elapsed / plannedDuration) * 100)).toFixed(2));
}

function calculateProgressSeverity(variance, hasSnapshot) {
  if (!hasSnapshot) return 'Not Measured';
  const value = Number(variance || 0);
  if (value <= 10) return 'Normal';
  if (value <= 20) return 'Medium';
  if (value <= 40) return 'High';
  return 'Urgent';
}

function calculateAccuracyPercent(predicted, actual) {
  const predictedValue = Number(predicted);
  const actualValue = Number(actual);
  if (!Number.isFinite(predictedValue) || !Number.isFinite(actualValue) || actualValue === 0) return null;
  return Number(Math.max(0, 100 - (Math.abs(predictedValue - actualValue) / Math.abs(actualValue)) * 100).toFixed(2));
}

function averagePresent(values) {
  const present = values.filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));
  return average(present);
}

function severityRank(severity) {
  return {
    'Not Measured': 1,
    Normal: 0,
    Medium: 2,
    High: 3,
    Urgent: 4,
  }[severity] ?? 0;
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
