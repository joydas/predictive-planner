const axios = require('axios');
const { pool } = require('../config/db.config');

const DEFAULT_ML_API_URL = 'http://127.0.0.1:8000';
const normalizeUrl = (url) => String(url || DEFAULT_ML_API_URL).replace(/\/+$/, '');
const ML_API_URL = normalizeUrl(process.env.ML_API_URL || DEFAULT_ML_API_URL);

async function ensurePredictionLogTable() {
  await pool.promise().query(`
    CREATE TABLE IF NOT EXISTS ml_prediction_log (
      prediction_log_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NULL,
      prediction_type VARCHAR(64) NOT NULL,
      request_payload JSON NOT NULL,
      prediction_response JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (prediction_log_id),
      INDEX idx_ml_prediction_log_user (user_id),
      INDEX idx_ml_prediction_log_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function logPrediction({ userId, predictionType, requestPayload, predictionResponse }) {
  await ensurePredictionLogTable();
  await pool.promise().query(
    `
      INSERT INTO ml_prediction_log
        (user_id, prediction_type, request_payload, prediction_response)
      VALUES (?, ?, ?, ?)
    `,
    [
      userId || null,
      predictionType,
      JSON.stringify(requestPayload || {}),
      JSON.stringify(predictionResponse || {}),
    ],
  );
}

async function callMl(endpoint, payload) {
  const response = await axios.post(`${ML_API_URL}${endpoint}`, payload, { timeout: 15000 });
  return response.data;
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
    risk,
    explanation: [
      ...(staffing.explanation || []),
      ...(effort.explanation || []),
      ...(risk.explanation || []),
    ].filter((value, index, values) => values.indexOf(value) === index),
  };

  await logPrediction({
    userId,
    predictionType: 'project_creation_recommendation',
    requestPayload: projectData,
    predictionResponse: response,
  });

  return response;
}

module.exports = {
  getProjectRecommendations,
  logPrediction,
};
