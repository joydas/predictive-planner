const { pool } = require('../config/db.config');

const db = pool.promise();

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

module.exports = {
  getPmSummary,
  getAmSummary,
  getMlAccuracy,
  getProjectRisk,
  getCrTrends,
};
