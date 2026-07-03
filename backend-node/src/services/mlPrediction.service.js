const axios = require('axios');
const { pool } = require('../config/db.config');
const TenantContext = require('../utils/tenantContext');

const DEFAULT_ML_API_URL = 'http://127.0.0.1:8000';
const normalizeUrl = (url) => String(url || DEFAULT_ML_API_URL).replace(/\/+$/, '');
const ML_API_URL = normalizeUrl(process.env.ML_API_URL || DEFAULT_ML_API_URL);

async function logPrediction({ userId, projectId, predictionType, requestPayload, predictionResponse }) {
  const organizationId = TenantContext.getOrganizationId();
  const [result] = await pool.promise().query(
    `
      INSERT INTO ml_prediction_log
        (organization_id, project_id, generated_by_user_id, prediction_type, request_payload, prediction_response)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      organizationId,
      projectId || null,
      userId || null,
      predictionType,
      JSON.stringify(requestPayload || {}),
      JSON.stringify(predictionResponse || {}),
    ],
  );
  return result.insertId;
}

async function callMl(endpoint, payload) {
  const organizationId = TenantContext.getOrganizationId();
  const response = await axios.post(`${ML_API_URL}${endpoint}`, { ...payload, organizationId }, { timeout: 15000 });
  return response.data;
}

function sumStaffing(staffing = {}) {
  return Object.values(staffing || {}).reduce((sum, next) => {
    const value = Number(next || 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

async function getProjectRecommendations(projectData, userId) {
  const [staffing, effort, risk] = await Promise.all([
    callMl('/predict/staffing', projectData),
    callMl('/predict/effort', projectData),
    callMl('/predict/risk', projectData),
  ]);

  const response = {
    staffing,
    effort,
    estimation: {
      recommendedValue: Number(effort.predictedHours || 0),
      unit: 'PD',
      advisoryOnly: true,
    },
    risk,
    baselineSnapshot: {
      effort: Number(effort.predictedHours || 0),
      budget: null,
      teamSize: sumStaffing(staffing.recommendedTeam || {}),
    },
    explanation: [
      ...(staffing.explanation || []),
      ...(effort.explanation || []),
      ...(risk.explanation || []),
    ].filter((value, index, values) => values.indexOf(value) === index),
  };

  const predictionId = await logPrediction({
    userId,
    projectId: projectData.projectId || projectData.draftId || projectData.projectDraftId || null,
    predictionType: 'project_creation_recommendation',
    requestPayload: projectData,
    predictionResponse: response,
  });

  return { ...response, predictionId };
}

function normalizeRoleName(role) {
  return String(role || '').trim().replace(/\s+/g, '_');
}

function aggregateFinalStaffing(rows = []) {
  return (rows || []).reduce((acc, row) => {
    const role = normalizeRoleName(row.role);
    if (!role) return acc;
    acc[role] = (acc[role] || 0) + Number(row.count || 0);
    return acc;
  }, {});
}

function diffStaffing(mlStaffing = {}, finalStaffing = {}) {
  const roles = new Set([...Object.keys(mlStaffing || {}), ...Object.keys(finalStaffing || {})]);
  return Array.from(roles).reduce((acc, role) => {
    const ml = Number(mlStaffing?.[role] || 0);
    const final = Number(finalStaffing?.[role] || 0);
    if (ml !== final) {
      acc[role] = { ml, final, delta: final - ml };
    }
    return acc;
  }, {});
}

async function recordPredictionFeedback({ projectId, projectDraftId, projectData, actualOutcome = {} }) {
  const recommendation = projectData?.mlRecommendation?.recommendation || {};
  const predictionId = recommendation.predictionId || projectData?.predictionId || null;
  const targetProjectId = projectId || projectDraftId || projectData?.projectId || projectData?.draftId || null;
  if (!predictionId && !targetProjectId) return null;

  const organizationId = TenantContext.getOrganizationId();
  const finalStaffing = aggregateFinalStaffing(projectData?.teamComposition?.rows || []);
  const recommendedStaffing = recommendation.staffing?.recommendedTeam || {};
  const overrideDiff = diffStaffing(recommendedStaffing, finalStaffing);
  const finalEffort = Number(projectData?.financial?.planned_effort || 0);

  const [existing] = await pool.promise().query(
    `
      SELECT feedback_id AS feedbackId
      FROM ml_prediction_feedback
      WHERE (prediction_id <=> ?) AND (project_id <=> ?) AND organization_id = ?
      LIMIT 1
    `,
    [predictionId, targetProjectId || null, organizationId],
  );

  const values = [
    organizationId,
    predictionId,
    targetProjectId || null,
    JSON.stringify(finalStaffing),
    JSON.stringify(overrideDiff),
    finalEffort,
    actualOutcome.actualEffort ?? null,
    actualOutcome.actualScheduleVariance ?? null,
    actualOutcome.actualStaffing ? JSON.stringify(actualOutcome.actualStaffing) : null,
    actualOutcome.actualCrCount ?? null,
    projectData?.mlRecommendation?.overrideReason || null,
  ];

  if (existing.length) {
    await pool.promise().query(
      `
        UPDATE ml_prediction_feedback
        SET final_staffing = ?,
            staffing_override_diff = ?,
            final_effort = ?,
            actual_effort = COALESCE(?, actual_effort),
            actual_schedule_variance = COALESCE(?, actual_schedule_variance),
            actual_staffing = COALESCE(?, actual_staffing),
            actual_cr_count = COALESCE(?, actual_cr_count),
            pm_override_reason = ?
        WHERE feedback_id = ? AND organization_id = ?
      `,
      [values[3], values[4], values[5], values[6], values[7], values[8], values[9], values[10], existing[0].feedbackId, organizationId],
    );
    return existing[0].feedbackId;
  }

  const [result] = await pool.promise().query(
    `
      INSERT INTO ml_prediction_feedback
        (organization_id, prediction_id, project_id, final_staffing, staffing_override_diff, final_effort,
         actual_effort, actual_schedule_variance, actual_staffing, actual_cr_count, pm_override_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    values,
  );
  return result.insertId;
}

async function recordActualOutcome({ predictionId, projectId, projectDraftId, actualEffort, actualScheduleVariance, actualStaffing, actualCrCount }) {
  const targetProjectId = projectId || projectDraftId || null;
  if (!predictionId && !targetProjectId) {
    const error = new Error('predictionId or projectId is required');
    error.status = 400;
    throw error;
  }
  const organizationId = TenantContext.getOrganizationId();
  const [result] = await pool.promise().query(
    `
      UPDATE ml_prediction_feedback
      SET actual_effort = ?,
          actual_schedule_variance = ?,
          actual_staffing = ?,
          actual_cr_count = ?
      WHERE ((prediction_id <=> ?) OR (project_id <=> ?)) AND organization_id = ?
    `,
    [
      actualEffort ?? null,
      actualScheduleVariance ?? null,
      actualStaffing ? JSON.stringify(actualStaffing) : null,
      actualCrCount ?? null,
      predictionId || null,
      targetProjectId,
      organizationId,
    ],
  );
  return result.affectedRows;
}

module.exports = {
  getProjectRecommendations,
  logPrediction,
  recordPredictionFeedback,
  recordActualOutcome,
};
