const axios = require('axios');
const { pool } = require('../config/db.config');

const DEFAULT_ML_API_URL = 'http://127.0.0.1:8000';
const normalizeUrl = (url) => String(url || DEFAULT_ML_API_URL).replace(/\/+$/, '');
const ML_API_URL = normalizeUrl(process.env.ML_API_URL || DEFAULT_ML_API_URL);
let snapshotTableReady = false;

const TREND_THRESHOLDS = {
  scheduleDays: Number(process.env.FORECAST_TREND_SCHEDULE_STABLE_DAYS || 2),
  effortPd: Number(process.env.FORECAST_TREND_EFFORT_STABLE_PD || 5),
  budget: Number(process.env.FORECAST_TREND_BUDGET_STABLE_AMOUNT || 10000),
  confidence: Number(process.env.FORECAST_TREND_CONFIDENCE_STABLE_POINTS || 2),
};

function normalizeRole(user) {
  const role = String(user?.role || '').toUpperCase();
  return role === 'AM' ? 'ACCOUNT_MANAGER' : role;
}

function visibilityWhere(user, projectAlias = 'p', draftAlias = 'pd') {
  const role = normalizeRole(user);
  if (role === 'ADMIN') return { sql: '1 = 1', params: [] };
  if (role === 'PM') {
    return {
      sql: `(${projectAlias}.owner_id = ? OR ${draftAlias}.submitted_by_user_id = ?)`,
      params: [user.userId, user.userId],
    };
  }
  if (role === 'ACCOUNT_MANAGER') {
    return {
      sql: `(
        ${projectAlias}.approved_by_user_id = ?
        OR EXISTS (
          SELECT 1
          FROM app_user assigned_pm
          WHERE assigned_pm.user_id = COALESCE(${draftAlias}.submitted_by_user_id, ${projectAlias}.owner_id)
            AND assigned_pm.manager_id = ?
        )
      )`,
      params: [user.userId, user.userId],
    };
  }
  return { sql: '1 = 0', params: [] };
}

async function ensureSnapshotTable() {
  if (snapshotTableReady) return;
  await pool.promise().query(`
    CREATE TABLE IF NOT EXISTS project_forecast_snapshot (
      snapshot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      project_id BIGINT UNSIGNED NOT NULL,
      snapshot_date DATE NOT NULL,
      forecast_completion_date DATE NULL,
      forecast_delay_days INT NULL,
      forecast_final_effort DECIMAL(14,2) NULL,
      forecast_final_budget DECIMAL(16,2) NULL,
      forecast_confidence DECIMAL(5,2) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (snapshot_id),
      UNIQUE KEY uq_project_forecast_snapshot_date (project_id, snapshot_date),
      INDEX idx_project_forecast_snapshot_project (project_id),
      INDEX idx_project_forecast_snapshot_date (snapshot_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  snapshotTableReady = true;
}

async function canAccessProject(user, projectId) {
  const visibility = visibilityWhere(user);
  const [rows] = await pool.promise().query(
    `
      SELECT p.project_id AS projectId
      FROM project p
      INNER JOIN project_drafts pd ON pd.draft_id = p.source_draft_id
      WHERE p.project_id = ?
        AND ${visibility.sql}
      LIMIT 1
    `,
    [projectId, ...visibility.params],
  );
  return rows.length > 0;
}

async function callCompletionForecastModel(projectId) {
  const response = await axios.post(
    `${ML_API_URL}/predict/completion-date`,
    { projectId },
    { timeout: 15000 },
  );
  return response.data;
}

async function callFinalEffortForecastModel(projectId) {
  const response = await axios.post(
    `${ML_API_URL}/predict/final-effort`,
    { projectId },
    { timeout: 15000 },
  );
  return response.data;
}

async function callFinalBudgetForecastModel(projectId) {
  const response = await axios.post(
    `${ML_API_URL}/predict/final-budget`,
    { projectId },
    { timeout: 15000 },
  );
  return response.data;
}

function unavailableForecast(message = 'Forecast is currently unavailable.') {
  return {
    forecastAvailable: false,
    message,
  };
}

function forecastErrorMessage(error) {
  return error.response?.data?.detail || 'Forecast service is currently unavailable.';
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toDateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function averageConfidence(...forecasts) {
  const values = forecasts
    .map((forecast) => toNumber(forecast?.confidence))
    .filter((value) => value !== null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildSnapshot(projectId, forecast) {
  const completion = forecast.completionDate || forecast;
  const effort = forecast.finalEffort || {};
  const budget = forecast.finalBudget || {};
  return {
    projectId,
    snapshotDate: new Date().toISOString().slice(0, 10),
    forecastCompletionDate: completion.forecastAvailable ? toDateOnly(completion.forecastCompletionDate) : null,
    forecastDelayDays: completion.forecastAvailable ? toNumber(completion.forecastDelayDays) : null,
    forecastFinalEffort: effort.forecastAvailable ? toNumber(effort.forecastFinalEffort) : null,
    forecastFinalBudget: budget.forecastAvailable ? toNumber(budget.forecastFinalBudget) : null,
    forecastConfidence: averageConfidence(completion, effort, budget),
  };
}

async function upsertForecastSnapshot(projectId, forecast) {
  const snapshot = buildSnapshot(projectId, forecast);
  const hasAnyForecast = snapshot.forecastCompletionDate
    || snapshot.forecastDelayDays !== null
    || snapshot.forecastFinalEffort !== null
    || snapshot.forecastFinalBudget !== null
    || snapshot.forecastConfidence !== null;
  if (!hasAnyForecast) return null;

  await ensureSnapshotTable();
  await pool.promise().query(
    `
      INSERT INTO project_forecast_snapshot (
        project_id,
        snapshot_date,
        forecast_completion_date,
        forecast_delay_days,
        forecast_final_effort,
        forecast_final_budget,
        forecast_confidence
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        forecast_completion_date = VALUES(forecast_completion_date),
        forecast_delay_days = VALUES(forecast_delay_days),
        forecast_final_effort = VALUES(forecast_final_effort),
        forecast_final_budget = VALUES(forecast_final_budget),
        forecast_confidence = VALUES(forecast_confidence),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      snapshot.projectId,
      snapshot.snapshotDate,
      snapshot.forecastCompletionDate,
      snapshot.forecastDelayDays,
      snapshot.forecastFinalEffort,
      snapshot.forecastFinalBudget,
      snapshot.forecastConfidence,
    ],
  );
  return snapshot;
}

async function readForecastHistory(projectId) {
  await ensureSnapshotTable();
  const [rows] = await pool.promise().query(
    `
      SELECT
        s.snapshot_id AS snapshotId,
        s.project_id AS projectId,
        s.snapshot_date AS snapshotDate,
        s.forecast_completion_date AS forecastCompletionDate,
        s.forecast_delay_days AS forecastDelayDays,
        s.forecast_final_effort AS forecastFinalEffort,
        s.forecast_final_budget AS forecastFinalBudget,
        s.forecast_confidence AS forecastConfidence,
        s.created_at AS createdAt,
        s.updated_at AS updatedAt
      FROM project_forecast_snapshot s
      INNER JOIN project p ON p.project_id = s.project_id
      WHERE s.project_id = ?
      ORDER BY s.snapshot_date DESC, s.snapshot_id DESC
      LIMIT 30
    `,
    [projectId],
  );
  return rows.map((row) => ({
    ...row,
    forecastDelayDays: row.forecastDelayDays === null ? null : Number(row.forecastDelayDays),
    forecastFinalEffort: row.forecastFinalEffort === null ? null : Number(row.forecastFinalEffort),
    forecastFinalBudget: row.forecastFinalBudget === null ? null : Number(row.forecastFinalBudget),
    forecastConfidence: row.forecastConfidence === null ? null : Number(row.forecastConfidence),
  }));
}

function trendStatus(delta, threshold, positiveLabel, negativeLabel, stableLabel = 'Stable') {
  if (delta === null || delta === undefined || !Number.isFinite(Number(delta))) {
    return 'No Previous Forecast';
  }
  const numeric = Number(delta);
  if (Math.abs(numeric) <= threshold) return stableLabel;
  return numeric > 0 ? positiveLabel : negativeLabel;
}

function daysBetween(currentDate, previousDate) {
  const current = currentDate ? new Date(`${currentDate}T00:00:00Z`) : null;
  const previous = previousDate ? new Date(`${previousDate}T00:00:00Z`) : null;
  if (!current || !previous || Number.isNaN(current.getTime()) || Number.isNaN(previous.getTime())) {
    return null;
  }
  return Math.round((current.getTime() - previous.getTime()) / 86400000);
}

function calculateForecastTrend(history) {
  if (!history.length) {
    return { hasPreviousForecast: false };
  }

  const current = history[0];
  const previous = history.find((item) => item.snapshotDate !== current.snapshotDate);
  if (!previous) {
    return {
      hasPreviousForecast: false,
      currentSnapshotDate: current.snapshotDate,
    };
  }

  const scheduleDeltaDays = daysBetween(current.forecastCompletionDate, previous.forecastCompletionDate);
  const effortDelta = current.forecastFinalEffort !== null && previous.forecastFinalEffort !== null
    ? current.forecastFinalEffort - previous.forecastFinalEffort
    : null;
  const budgetDelta = current.forecastFinalBudget !== null && previous.forecastFinalBudget !== null
    ? current.forecastFinalBudget - previous.forecastFinalBudget
    : null;
  const confidenceDelta = current.forecastConfidence !== null && previous.forecastConfidence !== null
    ? current.forecastConfidence - previous.forecastConfidence
    : null;

  return {
    hasPreviousForecast: true,
    currentSnapshotDate: current.snapshotDate,
    previousSnapshotDate: previous.snapshotDate,
    schedule: {
      deltaDays: scheduleDeltaDays,
      status: trendStatus(scheduleDeltaDays, TREND_THRESHOLDS.scheduleDays, 'Deteriorating', 'Improving'),
    },
    effort: {
      delta: effortDelta,
      status: trendStatus(effortDelta, TREND_THRESHOLDS.effortPd, 'Increasing', 'Decreasing'),
    },
    budget: {
      delta: budgetDelta,
      status: trendStatus(budgetDelta, TREND_THRESHOLDS.budget, 'Increasing', 'Decreasing'),
    },
    confidence: {
      delta: confidenceDelta,
      status: trendStatus(confidenceDelta, TREND_THRESHOLDS.confidence, 'Improving', 'Deteriorating'),
    },
    thresholds: TREND_THRESHOLDS,
  };
}

async function callProjectForecast(projectId) {
  const [completionForecast, finalEffortForecast, finalBudgetForecast] = await Promise.all([
    callCompletionForecastModel(projectId).catch((error) => unavailableForecast(forecastErrorMessage(error))),
    callFinalEffortForecastModel(projectId).catch((error) => unavailableForecast(forecastErrorMessage(error))),
    callFinalBudgetForecastModel(projectId).catch((error) => unavailableForecast(forecastErrorMessage(error))),
  ]);

  const forecast = {
    ...completionForecast,
    completionDate: completionForecast,
    finalEffort: finalEffortForecast,
    finalBudget: finalBudgetForecast,
  };
  await upsertForecastSnapshot(projectId, forecast);
  const history = await readForecastHistory(projectId);

  return {
    ...forecast,
    trend: calculateForecastTrend(history),
    history,
  };
}

async function getProjectForecast(user, projectId) {
  const allowed = await canAccessProject(user, projectId);
  if (!allowed) {
    const error = new Error('Access forbidden for this project');
    error.status = 403;
    throw error;
  }
  try {
    return await callProjectForecast(projectId);
  } catch (error) {
    return unavailableForecast('Forecast service is currently unavailable.');
  }
}

async function getForecastsForProjects(projectIds = []) {
  const uniqueIds = [...new Set(projectIds.map(Number).filter(Boolean))];
  const entries = await Promise.all(
    uniqueIds.map(async (projectId) => {
      try {
        return [projectId, await callProjectForecast(projectId)];
      } catch {
        return [projectId, unavailableForecast('Forecast service is currently unavailable.')];
      }
    }),
  );
  return Object.fromEntries(entries);
}

module.exports = {
  getProjectForecast,
  getForecastsForProjects,
};
