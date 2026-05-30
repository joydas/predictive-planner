const { pool } = require('../config/db.config');
const projectService = require('./project.service');
const crService = require('./cr.service');
const forecastService = require('./forecastService');

const PROJECT_COUNT_OPTIONS = [5, 10, 25, 50];
const STAGES = {
  CREATING_PROJECTS: 'Creating Projects...',
  CREATING_CRS: 'Creating CRs...',
  GENERATING_PROGRESS: 'Generating Progress...',
  COMPLETING_PROJECTS: 'Completing Projects...',
  RUNNING_FORECASTS: 'Running Forecasts...',
  FINALIZING: 'Finalizing...',
};

const INDUSTRIES = ['Banking', 'Insurance', 'Retail', 'Healthcare', 'Telecom'];
const TECHNOLOGIES = ['Java', '.NET', 'Python', 'Cloud', 'Data Engineering'];
const COMPLEXITIES = [
  { label: 'Low', value: 1, factor: 0.85 },
  { label: 'Medium', value: 2, factor: 1 },
  { label: 'High', value: 3, factor: 1.2 },
];
const CR_CATEGORIES = ['Scope', 'Compliance', 'Integration', 'Performance', 'Reporting'];
const ROLES_BY_TECHNOLOGY = {
  Java: ['Project Manager', 'Business Analyst', 'Java Developer', 'Java Lead', 'Manual Tester'],
  '.NET': ['Project Manager', 'Business Analyst', 'React Developer', 'React Lead', 'Manual Tester'],
  Python: ['Project Manager', 'Business Analyst', 'Python Developer', 'Python Lead', 'Manual Tester'],
  Cloud: ['Project Manager', 'Business Analyst', 'Cloud Engineer', 'DevOps Engineer', 'Manual Tester'],
  'Data Engineering': ['Project Manager', 'Business Analyst', 'Data Engineer', 'Data Scientist', 'QA Lead'],
};

let activeRunPromise = null;

function normalizeRole(role) {
  const value = String(role || '').trim().toUpperCase();
  return value === 'ACCOUNT_MANAGER' ? 'AM' : value;
}

function assertAdmin(user) {
  if (normalizeRole(user?.role) !== 'ADMIN') {
    const error = new Error('Administration access requires ADMIN role');
    error.status = 403;
    throw error;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(values) {
  return values[randomInt(0, values.length - 1)];
}

function toDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function workingDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  let days = 0;
  for (const current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

async function query(sql, params = []) {
  const [rows] = await pool.promise().query(sql, params);
  return rows;
}

async function tableExists(tableName) {
  const rows = await query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1
    `,
    [tableName],
  );
  return rows.length > 0;
}

async function columnExists(tableName, columnName) {
  const rows = await query(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );
  return rows.length > 0;
}

async function addColumnIfMissing(tableName, columnName, ddl) {
  if (await tableExists(tableName) && !(await columnExists(tableName, columnName))) {
    await query(ddl);
  }
}

async function ensureRegressionSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS regression_run (
      run_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      requested_by_user_id BIGINT UNSIGNED NOT NULL,
      requested_project_count INT NOT NULL DEFAULT 10,
      status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
      current_stage VARCHAR(100) NULL,
      projects_created INT NOT NULL DEFAULT 0,
      crs_created INT NOT NULL DEFAULT 0,
      progress_snapshots_created INT NOT NULL DEFAULT 0,
      completed_projects_created INT NOT NULL DEFAULT 0,
      forecasts_run INT NOT NULL DEFAULT 0,
      passed_steps INT NOT NULL DEFAULT 0,
      failed_steps INT NOT NULL DEFAULT 0,
      error_message TEXT NULL,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (run_id),
      INDEX idx_regression_run_status (status),
      INDEX idx_regression_run_started_at (started_at),
      INDEX idx_regression_run_requested_by (requested_by_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS regression_run_detail (
      detail_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      run_id BIGINT UNSIGNED NOT NULL,
      step_name VARCHAR(150) NOT NULL,
      entity_type VARCHAR(50) NULL,
      entity_id BIGINT UNSIGNED NULL,
      status VARCHAR(16) NOT NULL,
      message TEXT NULL,
      error_message TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (detail_id),
      INDEX idx_regression_run_detail_run (run_id),
      INDEX idx_regression_run_detail_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await addColumnIfMissing('project', 'is_regression_data', 'ALTER TABLE project ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0 AFTER approved_data');
  await addColumnIfMissing('project_drafts', 'is_regression_data', 'ALTER TABLE project_drafts ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0 AFTER published_at');
  await addColumnIfMissing('change_request', 'is_regression_data', 'ALTER TABLE change_request ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('project_progress_snapshot', 'is_regression_data', 'ALTER TABLE project_progress_snapshot ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('project_completion_history', 'is_regression_data', 'ALTER TABLE project_completion_history ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('project_completion_resource_loading', 'is_regression_data', 'ALTER TABLE project_completion_resource_loading ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('project_forecast_snapshot', 'is_regression_data', 'ALTER TABLE project_forecast_snapshot ADD COLUMN is_regression_data TINYINT(1) NOT NULL DEFAULT 0');
}

async function updateRun(runId, fields) {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const sql = entries.map(([key]) => `${key} = ?`).join(', ');
  await query(`UPDATE regression_run SET ${sql}, updated_at = NOW() WHERE run_id = ?`, [
    ...entries.map(([, value]) => value),
    runId,
  ]);
}

async function logStep(runId, stepName, status, { entityType = null, entityId = null, message = null, error = null } = {}) {
  await query(
    `
      INSERT INTO regression_run_detail
        (run_id, step_name, entity_type, entity_id, status, message, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      runId,
      stepName,
      entityType,
      entityId,
      status,
      message,
      error ? String(error.message || error).slice(0, 4000) : null,
    ],
  );
  await query(
    `
      UPDATE regression_run
      SET passed_steps = passed_steps + ?,
          failed_steps = failed_steps + ?,
          updated_at = NOW()
      WHERE run_id = ?
    `,
    [status === 'PASS' ? 1 : 0, status === 'FAIL' ? 1 : 0, runId],
  );
}

async function runStep(runId, stepName, fn, context = {}) {
  try {
    const result = await fn();
    await logStep(runId, stepName, 'PASS', { ...context, message: context.message || 'Step completed' });
    return result;
  } catch (error) {
    await logStep(runId, stepName, 'FAIL', { ...context, error });
    throw error;
  }
}

async function getRegressionActors() {
  const rows = await query(
    `
      SELECT
        pm.user_id AS pmUserId,
        pm.user_name AS pmUserName,
        am.user_id AS amUserId,
        am.user_name AS amUserName
      FROM app_user pm
      INNER JOIN app_user am ON am.user_id = pm.manager_id
      WHERE UPPER(pm.role_name) = 'PM'
        AND UPPER(am.role_name) IN ('AM', 'ACCOUNT_MANAGER')
        AND COALESCE(pm.active_flag, 1) = 1
        AND COALESCE(am.active_flag, 1) = 1
      ORDER BY pm.user_id
      LIMIT 1
    `,
  );
  if (!rows.length) {
    const error = new Error('Regression suite requires at least one active PM mapped to an active AM.');
    error.status = 400;
    throw error;
  }
  return {
    pm: { userId: rows[0].pmUserId, role: 'PM', name: rows[0].pmUserName },
    am: { userId: rows[0].amUserId, role: 'AM', name: rows[0].amUserName },
  };
}

async function getRoleCatalog() {
  const rows = await query(
    `
      SELECT
        r.role_id AS roleId,
        r.role_name AS roleName,
        COALESCE(rc.location_type, 'OFFSHORE') AS locationType,
        COALESCE(rc.rate_per_day, 500) AS ratePerDay
      FROM md_role r
      LEFT JOIN md_rate_card rc
        ON rc.role_id = r.role_id
       AND rc.active_flag = 1
      WHERE COALESCE(r.active_flag, 1) = 1
      ORDER BY r.role_name, FIELD(rc.location_type, 'OFFSHORE', 'ONSITE')
    `,
  );
  const byName = new Map();
  rows.forEach((row) => {
    if (!byName.has(row.roleName)) byName.set(row.roleName, row);
  });
  return byName;
}

function buildTeamRows({ technology, durationMonths, teamSize, startDate, endDate, roleCatalog }) {
  const roleNames = ROLES_BY_TECHNOLOGY[technology] || ROLES_BY_TECHNOLOGY.Java;
  const workingDayCount = workingDays(startDate, endDate);
  const rows = [];
  const distribution = [1, 1, Math.max(1, teamSize - 3), teamSize > 6 ? 2 : 1, Math.max(1, Math.round(teamSize * 0.2))];
  let remaining = teamSize;
  roleNames.forEach((roleName, index) => {
    if (remaining <= 0) return;
    const count = index === roleNames.length - 1 ? remaining : Math.min(remaining, distribution[index] || 1);
    remaining -= count;
    const role = roleCatalog.get(roleName) || Array.from(roleCatalog.values())[0] || {};
    rows.push({
      key: `test-${roleName}-${index}`,
      roleId: role.roleId || null,
      role: roleName,
      locationType: role.locationType || 'OFFSHORE',
      location: role.locationType || 'OFFSHORE',
      count,
      allocationPercent: durationMonths <= 4 ? 80 : 100,
      startDate,
      endDate,
      ratePerDay: Number(role.ratePerDay || 500),
      avgExperience: randomInt(3, 9),
      durationDays: workingDayCount,
    });
  });
  return rows;
}

function buildProjectPayload(index, roleCatalog) {
  const durationMonths = randomInt(3, 12);
  const complexity = pick(COMPLEXITIES);
  const technology = pick(TECHNOLOGIES);
  const industry = pick(INDUSTRIES);
  const start = addDays(new Date(), -randomInt(20, 180));
  const end = addMonths(start, durationMonths);
  const startDate = toDateOnly(start);
  const endDate = toDateOnly(end);
  const baseTeam = durationMonths <= 4 ? randomInt(2, 5) : durationMonths <= 7 ? randomInt(4, 8) : durationMonths <= 10 ? randomInt(6, 12) : randomInt(8, 15);
  const teamSize = clamp(Math.round(baseTeam * complexity.factor), 2, 15);
  const teamRows = buildTeamRows({ technology, durationMonths, teamSize, startDate, endDate, roleCatalog });

  return {
    durationMonths,
    complexity,
    technology,
    industry,
    startDate,
    endDate,
    teamRows,
    payload: {
      basicInfo: {
        project_name: `Test Project-${index}`,
        client_name: `Test Client-${randomInt(1, 5)}`,
        industry,
        industry_code: industry.toUpperCase().replace(/\s+/g, '_'),
        project_type: 'TEST DATA',
        delivery_model: pick(['Agile', 'Hybrid', 'Waterfall']),
        business_criticality: pick(['Low', 'Medium', 'High']),
        pm_estimated_value: randomInt(50, 95),
      },
      deliveryDetails: {
        start_date: startDate,
        planned_end_date: endDate,
        sprint_length: pick(['2', '3', '4']),
        release_frequency: pick(['Monthly', 'Quarterly']),
        milestone_count: String(Math.max(2, Math.round(durationMonths / 2))),
      },
      teamComposition: {
        rows: teamRows,
        locations: 'OFFSHORE',
        offshoreOnshoreRatio: '80:20',
      },
      technology: {
        technology_stack: technology,
        architecture_type: pick(['Layered', 'Microservices', 'Cloud Native']),
        cloud_platform: technology === 'Cloud' ? pick(['AWS', 'Azure', 'GCP']) : '',
        integration_count: randomInt(1, 8),
        external_dependencies: pick(['Vendor API', 'Internal systems', 'Payment gateway', 'Data lake']),
        complexity: complexity.value,
        complexity_label: complexity.label,
      },
      financial: {
        management_reserve_percent: randomInt(3, 8),
        contingency_reserve_percent: randomInt(5, 12),
        billing_model: pick(['Time & Material', 'Fixed Price']),
      },
      risks: {
        dependency_count: randomInt(1, 6),
        compliance_requirements: pick(['Internal policy only', 'PII handling', 'SOX controls', 'HIPAA review']),
        criticality: pick(['Low', 'Medium', 'High']),
        requirement_stability_index: randomInt(70, 95),
        expected_cr_volatility: pick(['Low', 'Medium']),
        risk_level_indicators: ['Medium delivery risk'],
      },
      baselineTracking: {
        ai: {
          effort: null,
          budget: null,
          teamSize: null,
        },
        estimation: {
          aiEstimatedValue: randomInt(50, 95),
        },
      },
      isRegressionData: true,
    },
  };
}

async function markRegression(tableName, whereSql, params) {
  if (await columnExists(tableName, 'is_regression_data')) {
    await query(`UPDATE ${tableName} SET is_regression_data = 1 ${whereSql}`, params);
  }
}

async function validateCount(tableName, whereSql, params) {
  const rows = await query(`SELECT COUNT(*) AS total FROM ${tableName} ${whereSql}`, params);
  return Number(rows[0]?.total || 0);
}

function buildCrPayload(projectId, crIndex, projectContext) {
  const effortImpact = Math.round(projectContext.plannedEffort * (randomInt(3, 12) / 100));
  const budgetImpact = Math.round(projectContext.plannedBudget * (randomInt(3, 12) / 100));
  return {
    projectId,
    title: `Test CR-${crIndex}`,
    description: `Regression generated change request ${crIndex} for ${projectContext.projectName}.`,
    category: pick(CR_CATEGORIES),
    severity: pick(['Low', 'Medium', 'High']),
    priority: pick(['Low', 'Medium', 'High']),
    affectedModule: pick(['Core Workflow', 'Reporting', 'Integration', 'Security']),
    scheduleImpactDays: randomInt(0, 30),
    effortImpact,
    budgetImpact,
    teamSizeImpact: randomInt(0, 2),
    dependencyImpact: pick(['No external dependency', 'Vendor dependency', 'Internal dependency']),
    environmentsAffected: pick(['DEV,QA', 'QA,UAT', 'UAT,PROD']),
    additionalBudget: budgetImpact,
  };
}

function buildProgressPoints(projectMeta, completed) {
  const months = completed ? projectMeta.durationMonths : Math.max(2, Math.min(projectMeta.durationMonths - 1, randomInt(2, 5)));
  const ranges = [
    [10, 20],
    [25, 40],
    [45, 60],
    [60, 80],
    [80, 95],
  ];
  const points = [];
  let previous = 0;
  for (let index = 0; index < months; index += 1) {
    const date = toDateOnly(addMonths(new Date(`${projectMeta.startDate}T00:00:00`), index + 1));
    const range = ranges[Math.min(index, ranges.length - 1)];
    const completion = completed && index === months - 1
      ? 100
      : clamp(randomInt(range[0], range[1]), previous + 5, 95);
    previous = completion;
    points.push({ date, completion });
  }
  return points;
}

function buildCompletionPayload(projectContext, projectMeta) {
  const effortVariance = 1 + randomInt(-8, 18) / 100;
  const budgetVariance = 1 + randomInt(-8, 18) / 100;
  const actualEffort = Math.round(projectContext.plannedEffort * effortVariance);
  const actualBudget = Math.round(projectContext.plannedBudget * budgetVariance);
  const managementCost = Math.round(actualBudget * 0.05);
  const contingencyCost = Math.round(actualBudget * 0.04);
  const resourceCost = Math.max(0, actualBudget - managementCost - contingencyCost);
  const totalTeam = projectMeta.teamRows.reduce((sum, row) => sum + Number(row.count || 0), 0) || 1;
  const resourceLoading = projectMeta.teamRows.map((row) => {
    const count = Number(row.count || 0);
    const roleEffort = Math.max(1, Math.round((actualEffort / totalTeam) * (count / Math.max(count, 1))));
    return {
      role: row.role,
      location: row.locationType || 'OFFSHORE',
      count,
      rate: Math.max(1, Math.round(resourceCost / Math.max(actualEffort, 1))),
      effort: roleEffort,
    };
  });
  return {
    resourceLoading,
    actualEffortPd: actualEffort,
    actualBudget,
    actualTeamSize: totalTeam,
    actualCompletionPercent: 100,
    actualCompletionDate: toDateOnly(addDays(new Date(`${projectMeta.endDate}T00:00:00`), randomInt(-15, 45))),
    actuals: {
      managementCost,
      contingencyCost,
    },
    groundMetrics: {
      dependencyCount: randomInt(1, 6),
      requirementStabilityIndex: randomInt(70, 95),
      actualCrVolatility: pick(['Low', 'Medium']),
      riskLevelIndicators: ['Medium delivery risk'],
    },
    comment: 'Regression suite completed TEST DATA project',
  };
}

async function loadProjectContext(projectId) {
  const rows = await query(
    `
      SELECT
        project_id AS projectId,
        project_name AS projectName,
        current_planned_effort AS plannedEffort,
        current_planned_budget AS plannedBudget,
        current_planned_team_size AS plannedTeamSize,
        source_draft_id AS sourceDraftId
      FROM project
      WHERE project_id = ?
      LIMIT 1
    `,
    [projectId],
  );
  return rows[0] || null;
}

async function validateWorkflowRows(runId, draftId, projectId) {
  const projectWorkflowCount = await validateCount('project_workflow_history', 'WHERE project_id = ?', [draftId]);
  if (projectWorkflowCount < 2) {
    throw new Error(`Expected project workflow history for draft ${draftId}`);
  }
  const projectCount = await validateCount('project', 'WHERE project_id = ? AND project_type = ? AND is_regression_data = 1', [projectId, 'TEST DATA']);
  if (projectCount !== 1) {
    throw new Error(`Project ${projectId} is not marked as TEST DATA regression data`);
  }
  await logStep(runId, 'Validate project workflow and TEST DATA flags', 'PASS', {
    entityType: 'PROJECT',
    entityId: projectId,
    message: `Workflow rows: ${projectWorkflowCount}`,
  });
}

async function executeRegressionRun(runId, options) {
  const started = Date.now();
  const stats = {
    projectsCreated: 0,
    crsCreated: 0,
    progressSnapshotsCreated: 0,
    completedProjectsCreated: 0,
    forecastsRun: 0,
  };
  const generatedProjects = [];

  try {
    const actors = await getRegressionActors();
    const roleCatalog = await getRoleCatalog();

    await updateRun(runId, { current_stage: STAGES.CREATING_PROJECTS });
    for (let index = 1; index <= options.projectCount; index += 1) {
      const projectMeta = buildProjectPayload(index, roleCatalog);
      const submitted = await runStep(
        runId,
        `Create and submit Test Project-${index}`,
        () => projectService.submitProject(actors.pm, projectMeta.payload, null, 'Regression suite project submission'),
        { entityType: 'PROJECT_DRAFT' },
      );
      const draftId = Number(submitted.draftId || submitted.projectId);
      await markRegression('project_drafts', 'WHERE draft_id = ?', [draftId]);
      const approval = await runStep(
        runId,
        `Approve Test Project-${index}`,
        () => projectService.transitionProject(draftId, actors.am, 'APPROVE', 'Regression suite project approval'),
        { entityType: 'PROJECT_DRAFT', entityId: draftId },
      );
      const projectId = Number(approval.publishedProjectId);
      await markRegression('project', 'WHERE project_id = ?', [projectId]);
      const projectContext = await loadProjectContext(projectId);
      await validateWorkflowRows(runId, draftId, projectId);
      generatedProjects.push({ projectId, draftId, meta: projectMeta, context: projectContext });
      stats.projectsCreated += 1;
      await updateRun(runId, { projects_created: stats.projectsCreated });
    }

    let crIndex = 1;
    await updateRun(runId, { current_stage: STAGES.CREATING_CRS });
    for (const project of generatedProjects) {
      const crCount = randomInt(0, 3);
      for (let index = 0; index < crCount; index += 1) {
        const crPayload = buildCrPayload(project.projectId, crIndex, project.context);
        const submittedCr = await runStep(
          runId,
          `Create and submit Test CR-${crIndex}`,
          () => crService.submitChangeRequest(actors.pm, null, crPayload, 'Regression suite CR submission'),
          { entityType: 'CR' },
        );
        const crId = Number(submittedCr.crId);
        await markRegression('change_request', 'WHERE cr_id = ?', [crId]);
        await runStep(
          runId,
          `Approve Test CR-${crIndex}`,
          () => crService.transitionChangeRequest(crId, actors.am, 'APPROVE', 'Regression suite CR approval'),
          { entityType: 'CR', entityId: crId },
        );
        stats.crsCreated += 1;
        crIndex += 1;
        await updateRun(runId, { crs_created: stats.crsCreated });
      }
      project.context = await loadProjectContext(project.projectId);
    }

    await updateRun(runId, { current_stage: STAGES.GENERATING_PROGRESS });
    for (const [index, project] of generatedProjects.entries()) {
      const shouldComplete = index < Math.ceil(generatedProjects.length * 0.6);
      const points = buildProgressPoints(project.meta, shouldComplete);
      for (const point of points) {
        const effort = Math.round(Number(project.context.plannedEffort || 0) * (point.completion / 100) * (1 + randomInt(-5, 8) / 100));
        const budget = Math.round(Number(project.context.plannedBudget || 0) * (point.completion / 100) * (1 + randomInt(-5, 8) / 100));
        await runStep(
          runId,
          `Save progress ${point.completion}% for ${project.context.projectName}`,
          () => projectService.saveProjectProgress(project.projectId, actors.pm, {
            snapshotDate: point.date,
            actualEffortPd: effort,
            actualBudget: budget,
            actualTeamSize: project.context.plannedTeamSize,
            actualCompletionPercent: point.completion,
            remarks: 'Regression suite progress snapshot',
          }),
          { entityType: 'PROJECT', entityId: project.projectId },
        );
        await markRegression('project_progress_snapshot', 'WHERE project_id = ?', [project.projectId]);
        stats.progressSnapshotsCreated += 1;
        await updateRun(runId, { progress_snapshots_created: stats.progressSnapshotsCreated });
      }
      project.shouldComplete = shouldComplete;
    }

    await updateRun(runId, { current_stage: STAGES.COMPLETING_PROJECTS });
    for (const project of generatedProjects.filter((item) => item.shouldComplete)) {
      const completionPayload = buildCompletionPayload(project.context, project.meta);
      await runStep(
        runId,
        `Complete ${project.context.projectName}`,
        () => projectService.completeProject(project.projectId, actors.pm, completionPayload),
        { entityType: 'PROJECT', entityId: project.projectId },
      );
      await markRegression('project_completion_history', 'WHERE project_id = ?', [project.projectId]);
      await markRegression('project_completion_resource_loading', 'WHERE project_id = ?', [project.projectId]);
      stats.completedProjectsCreated += 1;
      await updateRun(runId, { completed_projects_created: stats.completedProjectsCreated });
    }

    await updateRun(runId, { current_stage: STAGES.RUNNING_FORECASTS });
    for (const project of generatedProjects) {
      await runStep(
        runId,
        `Run forecast for ${project.context.projectName}`,
        async () => {
          const forecasts = await forecastService.getForecastsForProjects([project.projectId]);
          const forecast = forecasts[project.projectId];
          if (!forecast || typeof forecast !== 'object') {
            throw new Error('Forecast response was empty');
          }
          if (!('completionDate' in forecast) || !('finalEffort' in forecast) || !('finalBudget' in forecast)) {
            throw new Error('Forecast response missing expected sections');
          }
          await markRegression('project_forecast_snapshot', 'WHERE project_id = ?', [project.projectId]);
          return forecast;
        },
        { entityType: 'PROJECT', entityId: project.projectId },
      );
      stats.forecastsRun += 1;
      await updateRun(runId, { forecasts_run: stats.forecastsRun });
    }

    await updateRun(runId, { current_stage: STAGES.FINALIZING });
    await runStep(runId, 'Validate operational dashboard data', async () => {
      const count = await validateCount('project', "WHERE project_type = 'TEST DATA' AND is_regression_data = 1");
      if (count < stats.projectsCreated) throw new Error('Generated TEST DATA projects are not queryable for dashboards');
    });
    await runStep(runId, 'Validate analytics and forecasting data persistence', async () => {
      const progressCount = await validateCount('project_progress_snapshot', 'WHERE is_regression_data = 1');
      const forecastCount = await validateCount('project_forecast_snapshot', 'WHERE is_regression_data = 1');
      if (progressCount < stats.progressSnapshotsCreated) throw new Error('Progress snapshots were not persisted as regression data');
      if (forecastCount < 0) throw new Error('Forecast validation failed');
    });

    await updateRun(runId, {
      status: 'COMPLETED',
      current_stage: 'Completed',
      ended_at: new Date(),
      projects_created: stats.projectsCreated,
      crs_created: stats.crsCreated,
      progress_snapshots_created: stats.progressSnapshotsCreated,
      completed_projects_created: stats.completedProjectsCreated,
      forecasts_run: stats.forecastsRun,
    });
  } catch (error) {
    await updateRun(runId, {
      status: 'FAILED',
      current_stage: 'Failed',
      error_message: String(error.message || error),
      ended_at: new Date(),
    });
  } finally {
    activeRunPromise = null;
    console.info('Regression suite run finished', { runId, durationMs: Date.now() - started });
  }
}

async function startRegressionSuite(user, payload = {}) {
  assertAdmin(user);
  await ensureRegressionSchema();
  const projectCount = PROJECT_COUNT_OPTIONS.includes(Number(payload.projectCount))
    ? Number(payload.projectCount)
    : 10;
  if (activeRunPromise) {
    const error = new Error('A regression suite run is already in progress');
    error.status = 409;
    throw error;
  }
  const runningRows = await query("SELECT run_id AS runId FROM regression_run WHERE status = 'RUNNING' LIMIT 1");
  if (runningRows.length) {
    const error = new Error(`Regression suite run #${runningRows[0].runId} is already in progress`);
    error.status = 409;
    throw error;
  }

  const result = await query(
    `
      INSERT INTO regression_run
        (requested_by_user_id, requested_project_count, status, current_stage)
      VALUES (?, ?, 'RUNNING', ?)
    `,
    [user.userId, projectCount, STAGES.CREATING_PROJECTS],
  );
  const runId = result.insertId || result[0]?.insertId;
  activeRunPromise = executeRegressionRun(runId, { projectCount });
  activeRunPromise.catch((error) => {
    console.error('Regression suite run failed:', error);
  });
  return getRegressionRun(user, runId);
}

async function listRegressionRuns(user, params = {}) {
  assertAdmin(user);
  await ensureRegressionSchema();
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.min(Math.max(1, Number(params.pageSize || 10)), 50);
  const offset = (page - 1) * pageSize;
  const countRows = await query('SELECT COUNT(*) AS total FROM regression_run');
  const rows = await query(
    `
      SELECT
        run_id AS runId,
        requested_project_count AS requestedProjectCount,
        status,
        current_stage AS currentStage,
        projects_created AS projectsCreated,
        crs_created AS crsCreated,
        progress_snapshots_created AS progressSnapshotsCreated,
        completed_projects_created AS completedProjectsCreated,
        forecasts_run AS forecastsRun,
        passed_steps AS passedSteps,
        failed_steps AS failedSteps,
        error_message AS errorMessage,
        started_at AS startedAt,
        ended_at AS endedAt,
        TIMESTAMPDIFF(SECOND, started_at, COALESCE(ended_at, NOW())) AS durationSeconds
      FROM regression_run
      ORDER BY run_id DESC
      LIMIT ? OFFSET ?
    `,
    [pageSize, offset],
  );
  return {
    items: rows,
    pagination: {
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
    },
  };
}

async function getRegressionRun(user, runId) {
  assertAdmin(user);
  await ensureRegressionSchema();
  const rows = await query(
    `
      SELECT
        run_id AS runId,
        requested_project_count AS requestedProjectCount,
        status,
        current_stage AS currentStage,
        projects_created AS projectsCreated,
        crs_created AS crsCreated,
        progress_snapshots_created AS progressSnapshotsCreated,
        completed_projects_created AS completedProjectsCreated,
        forecasts_run AS forecastsRun,
        passed_steps AS passedSteps,
        failed_steps AS failedSteps,
        error_message AS errorMessage,
        started_at AS startedAt,
        ended_at AS endedAt,
        TIMESTAMPDIFF(SECOND, started_at, COALESCE(ended_at, NOW())) AS durationSeconds
      FROM regression_run
      WHERE run_id = ?
      LIMIT 1
    `,
    [runId],
  );
  if (!rows.length) {
    const error = new Error('Regression run not found');
    error.status = 404;
    throw error;
  }
  const details = await query(
    `
      SELECT
        detail_id AS detailId,
        step_name AS stepName,
        entity_type AS entityType,
        entity_id AS entityId,
        status,
        message,
        error_message AS errorMessage,
        created_at AS createdAt
      FROM regression_run_detail
      WHERE run_id = ?
      ORDER BY detail_id DESC
      LIMIT 250
    `,
    [runId],
  );
  return { run: rows[0], details };
}

module.exports = {
  getRegressionRun,
  listRegressionRuns,
  startRegressionSuite,
};
