#!/usr/bin/env node

/**
 * Predictive Planner – One-Time Data Rejuvenation Utility
 *
 * Purpose: Generate ~200 realistic projects with complete execution history
 * Execution: Manual one-time run
 * Usage: node utils/dataRejuvenation.js [--dry-run]
 *
 * Generated Data:
 * - ~200 Projects across 6 tech stacks
 * - Realistic team compositions
 * - Calculated budgets (role-based rates, bottom-up per resource row)
 * - current_planned_* set correctly from bottom-up resource cost on creation
 * - Project completion outcomes (40% on-time, 40% minor delay, 20% major delay)
 * - 0-5 change requests per project
 * - Monthly progress snapshots
 * - Team loading snapshots
 * - Completion history with resource_cost = SUM of per-row costs
 * - project_completion_resource_loading rows populated to match resource_cost
 * - Forecast records
 */

const { pool } = require('../src/config/db.config');

const CONFIG = {
  organizationId: 1,
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
  PROJECT_COUNT: 5,
};

// ============================================================================
// STATIC DATA DEFINITIONS
// ============================================================================

const TECH_STACKS = {
  JAVA: {
    projectCount: CONFIG.PROJECT_COUNT,
    name: 'Java',
    stack: 'Java',
    roles: ['Java Developer', 'Java Lead', 'QA Lead', 'Manual Tester', 'Project Manager'],
  },
  REACT: {
    projectCount: CONFIG.PROJECT_COUNT,
    name: 'React',
    stack: 'React',
    roles: ['React Developer', 'React Lead', 'QA Lead', 'Automation Tester', 'Project Manager'],
  },
  DOTNET: {
    projectCount: CONFIG.PROJECT_COUNT,
    name: '.NET',
    stack: '.NET',
    roles: ['.NET Developer', '.NET Lead', 'QA Lead', 'Manual Tester', 'Project Manager'],
  },
  PYTHON: {
    projectCount: CONFIG.PROJECT_COUNT,
    name: 'Python',
    stack: 'Python',
    roles: ['Python Developer', 'Python Lead', 'QA Lead', 'DevOps Engineer', 'Project Manager'],
  },
  NODEJS: {
    projectCount: CONFIG.PROJECT_COUNT,
    name: 'Node.js',
    stack: 'NodeJS',
    roles: ['Node.js Developer', 'Node.js Lead', 'QA Lead', 'DevOps Engineer', 'Project Manager'],
  },
  SAP: {
    projectCount: CONFIG.PROJECT_COUNT,
    name: 'SAP',
    stack: 'SAP',
    roles: ['SAP Consultant', 'SAP Lead', 'QA Lead', 'Project Manager'],
  },
};

const PROJECT_SERIES = {
  JAVA: ['Apex', 'Nova', 'Titan', 'Orion', 'Phoenix'],
  REACT: ['Aurora', 'Nebula', 'Solaris', 'Horizon', 'Stellar'],
  DOTNET: ['Vertex', 'Vector', 'Velocity', 'Valor'],
  PYTHON: ['Prism', 'Pulse', 'Phoenix', 'Proton'],
  NODEJS: ['Node-X', 'Node-Y', 'Node-Z'],
  SAP: ['Sapphire', 'Sage'],
};

const CLIENTS = [
  'Acme Corp', 'Global Retail', 'NextGen Bank', 'HealthOne',
  'TechSphere', 'Innovate Ltd', 'Future Systems', 'Smart Solutions',
];

const INDUSTRIES = ['BFSI', 'HEALTHCARE', 'RETAIL', 'TELECOM', 'TECHNOLOGY', 'MANUFACTURING'];

const DELIVERY_MODELS = ['Waterfall', 'Agile', 'Hybrid'];

const BUSINESS_CRITICALITY = ['Low', 'Medium', 'High', 'Critical'];

// Duration distribution: [3-6 months: 30%, 6-9 months: 50%, 9-12 months: 20%]
const DURATION_DISTRIBUTION = [
  { min: 90,  max: 180, weight: 0.30 },
  { min: 180, max: 270, weight: 0.50 },
  { min: 270, max: 360, weight: 0.20 },
];

const COMPLETION_OUTCOMES = [
  { name: 'On Time',      delayDays: 0,  weight: 0.40 },
  { name: 'Minor Delay',  delayDays: 15, weight: 0.40 },
  { name: 'Major Delay',  delayDays: 45, weight: 0.20 },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message, isWarning = false) {
  if (CONFIG.verbose || isWarning) {
    console.log(`${isWarning ? '⚠️ ' : '✓ '} ${message}`);
  }
}

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function getWeightedRandom(items) {
  const random = Math.random();
  let sum = 0;
  for (const item of items) {
    sum += item.weight;
    if (random <= sum) return item;
  }
  return items[items.length - 1];
}

function generateProjectName(techKey, index) {
  const series = PROJECT_SERIES[techKey];
  const seriesName = series[Math.floor(index / 10) % series.length];
  const seriesNum = (index % 10) + 1;
  return `${seriesName}_${String(seriesNum).padStart(3, '0')}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateOnly(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Count working days (Mon–Fri) between two dates, inclusive.
 * Mirrors getWorkingDays() in project.service.js.
 */
function countWorkingDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end   = new Date(`${endDate}T00:00:00`);
  if (end < start) return 0;
  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const d = cur.getDay();
    if (d !== 0 && d !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ============================================================================
// MASTER DATA
// ============================================================================

async function getMasterData() {
  const [roles] = await pool.promise().query(
    'SELECT role_id, role_name FROM md_role WHERE active_flag = 1 ORDER BY role_name'
  );
  const [rateCards] = await pool.promise().query(
    `SELECT rc.role_id, rc.rate_per_day, rc.location_type
     FROM md_rate_card rc
     WHERE rc.active_flag = 1
       AND rc.effective_from <= CURRENT_DATE()
       AND (rc.effective_to IS NULL OR rc.effective_to >= CURRENT_DATE())`
  );
  const [industries] = await pool.promise().query(
    'SELECT industry_id, industry_code, industry_name FROM md_industry WHERE is_active = 1'
  );
  return { roles, rateCards, industries };
}

// ============================================================================
// TEAM COMPOSITION & BUDGET  (bottom-up, per-row cost)
// ============================================================================

/**
 * Returns the daily rate for a role + location combination.
 * Falls back to ONSITE rate, then to a sensible default.
 */
function getRatePerDay(roleId, locationType, rateCards) {
  const exact = rateCards.find(
    rc => rc.role_id === roleId && rc.location_type === locationType
  );
  if (exact) return parseFloat(exact.rate_per_day);

  // Fall back to ONSITE rate if OFFSHORE not found (or vice-versa)
  const fallback = rateCards.find(rc => rc.role_id === roleId);
  return fallback ? parseFloat(fallback.rate_per_day) : 500;
}

/**
 * Build team rows and compute per-row cost bottom-up.
 *
 * Each row stores:
 *   workingDays   – calendar working days for this resource over the project span
 *   plannedEffort – count × (allocation/100) × workingDays  (person-days)
 *   ratePerDay    – from rate card
 *   plannedCost   – plannedEffort × ratePerDay              (currency)
 *
 * This is the same formula used in deriveResourcePlanning() in project.service.js.
 */
function buildTeamComposition(techKey, masterData, startDateStr, endDateStr) {
  const roleNames = TECH_STACKS[techKey].roles;
  const workingDays = countWorkingDays(startDateStr, endDateStr);

  // Map display role name → role_id using a prefix match
  const roleIdMap = {};
  for (const roleName of roleNames) {
    const firstWord = roleName.toLowerCase().split(' ')[0];
    const rec = masterData.roles.find(r =>
      r.role_name.toLowerCase().includes(firstWord)
    );
    if (rec) roleIdMap[roleName] = rec.role_id;
  }

  const leadRole    = roleNames.find(r => r.includes('Lead'));
  const devRoles    = roleNames.filter(r => r.includes('Developer') || r.includes('Consultant'));
  const qaRoles     = roleNames.filter(r => r.includes('QA'));
  const testRoles   = roleNames.filter(r => r.includes('Tester'));
  const devOpsRoles = roleNames.filter(r => r.includes('DevOps'));
  const pmRoles     = roleNames.filter(r => r.includes('Project Manager'));

  const specs = [];

  if (leadRole && roleIdMap[leadRole]) {
    specs.push({ roleName: leadRole, roleId: roleIdMap[leadRole], count: 1, locationType: 'ONSITE', allocationPercent: 100 });
  }
  devRoles.forEach(r => {
    if (roleIdMap[r]) specs.push({ roleName: r, roleId: roleIdMap[r], count: getRandomNumber(3, 8), locationType: getRandomItem(['ONSITE', 'OFFSHORE', 'HYBRID']), allocationPercent: 100 });
  });
  qaRoles.forEach(r => {
    if (roleIdMap[r]) specs.push({ roleName: r, roleId: roleIdMap[r], count: getRandomNumber(2, 4), locationType: getRandomItem(['ONSITE', 'OFFSHORE']), allocationPercent: 100 });
  });
  testRoles.forEach(r => {
    if (roleIdMap[r]) specs.push({ roleName: r, roleId: roleIdMap[r], count: getRandomNumber(1, 3), locationType: 'OFFSHORE', allocationPercent: 100 });
  });
  devOpsRoles.forEach(r => {
    if (roleIdMap[r]) specs.push({ roleName: r, roleId: roleIdMap[r], count: 1, locationType: 'HYBRID', allocationPercent: 100 });
  });
  pmRoles.forEach(r => {
    if (roleIdMap[r]) specs.push({ roleName: r, roleId: roleIdMap[r], count: 1, locationType: 'ONSITE', allocationPercent: 100 });
  });

  // Enrich each row with cost fields
  const rows = specs.map(spec => {
    // HYBRID isn't in the rate card ENUM; treat as ONSITE for billing
    const billingLocation = spec.locationType === 'HYBRID' ? 'ONSITE' : spec.locationType;
    const ratePerDay    = getRatePerDay(spec.roleId, billingLocation, masterData.rateCards);
    const plannedEffort = spec.count * (spec.allocationPercent / 100) * workingDays; // person-days
    const plannedCost   = plannedEffort * ratePerDay;

    return {
      ...spec,
      role:             spec.roleName,
      startDate:        startDateStr,
      endDate:          endDateStr,
      ratePerDay,
      workingDays,
      durationDays:     workingDays,
      plannedEffort,    // person-days
      plannedCost,      // currency
    };
  });

  // Bottom-up aggregates (mirrors deriveResourcePlanning in project.service.js)
  const baseResourceCost   = rows.reduce((s, r) => s + r.plannedCost,   0);
  const plannedEffortTotal = rows.reduce((s, r) => s + r.plannedEffort, 0);
  const estimatedTeamSize  = rows.reduce((s, r) => s + r.count,         0);

  // Apply a small management + contingency reserve (10%) to arrive at planned budget
  const reservePercent = 10;
  const budget = baseResourceCost * (1 + reservePercent / 100);

  return {
    rows,
    baseResourceCost: Math.ceil(baseResourceCost),
    plannedEffort:    Math.ceil(plannedEffortTotal),
    estimatedTeamSize,
    budget:           Math.ceil(budget),
  };
}

// ============================================================================
// PROJECT GENERATION
// ============================================================================

async function generateProject(index, techKey, masterData) {
  const startDate      = addDays(new Date('2023-01-01'), getRandomNumber(0, 730));
  const durationBucket = getWeightedRandom(DURATION_DISTRIBUTION);
  const plannedEndDate = addDays(startDate, getRandomNumber(durationBucket.min, durationBucket.max));

  const startDateStr = toDateOnly(startDate);
  const endDateStr   = toDateOnly(plannedEndDate);

  const team = buildTeamComposition(techKey, masterData, startDateStr, endDateStr);

  const completionOutcome    = getWeightedRandom(COMPLETION_OUTCOMES);
  const actualCompletionDate = addDays(plannedEndDate, completionOutcome.delayDays);
  const industryRecord       = getRandomItem(masterData.industries);

  return {
    projectName:         generateProjectName(techKey, index),
    clientName:          getRandomItem(CLIENTS),
    industry:            industryRecord.industry_name,
    industryCode:        industryRecord.industry_code,
    projectType:         getRandomItem(['Greenfield', 'Brownfield', 'Maintenance']),
    deliveryModel:       getRandomItem(DELIVERY_MODELS),
    businessCriticality: getRandomItem(BUSINESS_CRITICALITY),
    technologyStack:     TECH_STACKS[techKey].stack,
    complexity:          getRandomNumber(1, 5),
    startDate:           startDateStr,
    plannedEndDate:      endDateStr,
    actualCompletionDate: toDateOnly(actualCompletionDate),
    completionOutcome,
    // bottom-up financial values
    teamRows:          team.rows,
    baseResourceCost:  team.baseResourceCost,
    plannedEffort:     team.plannedEffort,
    estimatedTeamSize: team.estimatedTeamSize,
    budget:            team.budget,
    pmEstimatedValue:  team.plannedEffort,
  };
}

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

/**
 * Insert project row.
 *
 * current_planned_* is set to the bottom-up derived values (plannedEffort,
 * budget, estimatedTeamSize) so it matches the resource-loading sum exactly.
 * This mirrors what project.service.js / deriveResourcePlanning() produces
 * when a real project is approved through the UI.
 */
async function persistProject(connection, project, organizationId, ownerId) {
  const [result] = await connection.query(
    `INSERT INTO project
       (organization_id, owner_id, project_name, client_name, industry, industry_code,
        project_type, delivery_model, business_criticality, technology_stack,
        architecture_type, cloud_platform, complexity, estimated_team_size,
        planned_effort, budget, billing_model, start_date, planned_end_date,
        pm_estimated_value,
        pm_baseline_effort, pm_baseline_budget, pm_baseline_team_size,
        current_planned_effort, current_planned_budget, current_planned_team_size,
        workflow_status, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'APPROVED')`,
    [
      organizationId,
      ownerId,
      project.projectName,
      project.clientName,
      project.industry,
      project.industryCode,
      project.projectType,
      project.deliveryModel,
      project.businessCriticality || 'Medium',
      project.technologyStack,
      'Microservices',   // architectureType default
      'AWS',             // cloudPlatform default
      project.complexity,
      project.estimatedTeamSize,
      project.plannedEffort,          // planned_effort  = bottom-up person-days
      project.budget,                 // budget          = baseResourceCost + reserve
      'Time & Material',
      project.startDate,
      project.plannedEndDate,
      project.pmEstimatedValue,
      // pm_baseline mirrors what the UI stores when a PM submits
      project.plannedEffort,          // pm_baseline_effort
      project.budget,                 // pm_baseline_budget
      project.estimatedTeamSize,      // pm_baseline_team_size
      // current_planned = bottom-up derived values (not a copy of a UI field)
      project.plannedEffort,          // current_planned_effort
      project.budget,                 // current_planned_budget
      project.estimatedTeamSize,      // current_planned_team_size
    ]
  );

  const projectId = result.insertId;
  await connection.query(
    "UPDATE project SET project_code = CONCAT('PRJ-', LPAD(project_id, 6, '0')) WHERE project_id = ?",
    [projectId]
  );
  return projectId;
}

async function generateProgressSnapshots(connection, orgId, projectId, startDate, endDate, ownerId, budget, plannedEffort, estimatedTeamSize) {
  const durationDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
  const monthCount   = Math.ceil(durationDays / 30);

  let previousPercent = 0;

  for (let month = 0; month < monthCount; month++) {
    const snapshotDate      = toDateOnly(addDays(new Date(startDate), month * 30));
    const monthProgress     = (month + 1) / monthCount;
    const variation         = getRandomFloat(-5, 10);
    const completionPercent = Math.min(100, Math.max(previousPercent, monthProgress * 100 + variation));

    const actualEffortVal = parseFloat((plannedEffort * (completionPercent / 100) * getRandomFloat(0.9, 1.1)).toFixed(2));
    const actualBudgetVal = parseFloat((budget * (completionPercent / 100) * getRandomFloat(0.9, 1.15)).toFixed(2));
    const actualTeamSizeVal = parseFloat((estimatedTeamSize * getRandomFloat(0.9, 1.1)).toFixed(2));

    await connection.query(
      `INSERT INTO project_progress_snapshot
         (organization_id, project_id, snapshot_date, actual_effort_pd, actual_budget,
          actual_team_size, actual_completion_percent, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        projectId,
        snapshotDate,
        actualEffortVal,
        actualBudgetVal,
        actualTeamSizeVal,
        completionPercent,
        `Progress update – ${completionPercent.toFixed(0)}% complete`,
        ownerId,
      ]
    );

    previousPercent = completionPercent;
  }

  return monthCount;
}

async function generateChangeRequests(connection, orgId, projectId, maxCrs, ownerId) {
  const count = getRandomNumber(0, maxCrs);
  for (let i = 0; i < count; i++) {
    await connection.query(
      `INSERT INTO change_request
         (organization_id, project_id, cr_code, cr_title, cr_description, cr_category,
          severity, priority, status, effort_impact, budget_impact, team_size_impact,
          submitted_by_user_id, workflow_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED')`,
      [
        orgId,
        projectId,
        `CR-${String(i + 1).padStart(3, '0')}`,
        `Change Request ${i + 1}`,
        'Realistic change request for project maintenance and enhancement',
        getRandomItem(['Enhancement', 'Defect Fix', 'Performance', 'Security']),
        getRandomItem(['Low', 'Medium', 'High']),
        getRandomItem(['Low', 'Medium', 'High', 'Critical']),
        'APPROVED',
        getRandomNumber(10, 100),
        getRandomNumber(5000, 50000),
        getRandomNumber(1, 5),
        ownerId,
      ]
    );
  }
  return count;
}

/**
 * Generate completion history with resource_cost = sum of individual row costs.
 *
 * Bugs fixed:
 *  1. resource_cost was previously set to `actualBudget * 0.85` — an arbitrary
 *     percentage that had no relation to the per-row loading cost. It is now
 *     computed by summing each row's actualCost (count × ratePerDay × effortDays).
 *
 *  2. project_completion_resource_loading was never populated by this script,
 *     leaving the table empty while resource_cost in the parent record had an
 *     unverifiable number. Rows are now inserted so the SUM(actual_cost) in
 *     project_completion_resource_loading equals resource_cost exactly.
 *
 *  3. actualCost formula: cost = count × ratePerDay × effortDays (person-days).
 *     effort stored in this table is DAYS, consistent with md_rate_card.rate_per_day.
 */
async function generateCompletionHistory(connection, orgId, projectId, project, ownerId) {
  // Apply a ±15% variance to simulate actuals vs plan
  const actualVarianceFactor = getRandomFloat(0.85, 1.15);

  // Build actual resource loading rows from the planned team composition,
  // applying the variance factor uniformly to effort (and therefore cost).
  const actualRows = project.teamRows.map(row => {
    const effortDays = Math.ceil(row.workingDays * actualVarianceFactor);   // person-days per head
    const actualCost = row.count * row.ratePerDay * effortDays;             // consistent formula
    return {
      role:         row.roleName,
      location:     row.locationType === 'HYBRID' ? 'ONSITE' : row.locationType,
      count:        row.count,
      rate:         row.ratePerDay,
      effort:       effortDays,         // days — matches rate_per_day unit
      actualCost,
    };
  });

  // resource_cost = bottom-up sum of individual row costs (no magic percentage)
  const resourceCost    = actualRows.reduce((s, r) => s + r.actualCost, 0);
  const managementCost  = project.budget * 0.05;
  const contingencyCost = project.budget * 0.10;
  const fullProjectCost = resourceCost + managementCost + contingencyCost;
  const actualEffort    = actualRows.reduce((s, r) => s + (r.count * r.effort), 0);

  // Insert completion header
  const [completionResult] = await connection.query(
    `INSERT INTO project_completion_history
       (organization_id, project_id, completed_by_user_id,
        final_resource_loading, management_cost, contingency_cost,
        resource_cost, full_project_cost,
        actual_final_estimated_value, completion_payload,
        actual_completion_date, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      projectId,
      ownerId,
      JSON.stringify(actualRows),         // final_resource_loading JSON
      Math.ceil(managementCost),
      Math.ceil(contingencyCost),
      Math.ceil(resourceCost),            // = SUM(actual_cost) of detail rows below
      Math.ceil(fullProjectCost),
      Math.ceil(actualEffort),
      JSON.stringify({
        projectName:       project.projectName,
        completionOutcome: project.completionOutcome.name,
        actualEffort,
        actualBudget:      fullProjectCost,
      }),
      project.actualCompletionDate,
      project.actualCompletionDate,
    ]
  );

  const completionId = completionResult.insertId;

  // Insert per-row detail into project_completion_resource_loading.
  // SUM(actual_cost) across these rows will equal resource_cost exactly.
  if (actualRows.length > 0) {
    const resourceValues = actualRows.map(row => [
      orgId,
      completionId,
      projectId,
      row.role,
      row.location,
      row.count,
      row.rate,
      row.effort,
      Math.ceil(row.actualCost),
    ]);
    await connection.query(
      `INSERT INTO project_completion_resource_loading
         (organization_id, completion_id, project_id, role, location,
          resource_count, rate, effort, actual_cost)
       VALUES ?`,
      [resourceValues]
    );
  }

  // Update project actuals so the project table stays consistent
  await connection.query(
    `UPDATE project
     SET actual_effort = ?,
         actual_budget = ?,
         actual_team_size = ?,
         actual_completion_date = ?
     WHERE project_id = ?`,
    [
      Math.ceil(actualEffort),
      Math.ceil(fullProjectCost),
      project.estimatedTeamSize,
      project.actualCompletionDate,
      projectId,
    ]
  );

  return true;
}

async function generateForecastSnapshot(connection, orgId, projectId, project) {
  if (Math.random() > 0.5) return false;

  const forecastEffort           = project.plannedEffort * getRandomFloat(0.9, 1.1);
  const forecastBudget           = project.budget       * getRandomFloat(0.9, 1.1);
  const forecastDate             = addDays(new Date(project.startDate), getRandomNumber(30, 90));
  const forecastCompletionDate   = addDays(new Date(project.plannedEndDate), getRandomNumber(-10, 20));
  const delayDays                = Math.round(
    (forecastCompletionDate - new Date(project.plannedEndDate)) / (1000 * 60 * 60 * 24)
  );

  await connection.query(
    `INSERT INTO project_forecast_snapshot
       (organization_id, project_id, snapshot_date, forecast_completion_date,
        forecast_delay_days, forecast_final_effort, forecast_final_budget, forecast_confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      projectId,
      toDateOnly(forecastDate),
      toDateOnly(forecastCompletionDate),
      delayDays,
      Math.ceil(forecastEffort),
      Math.ceil(forecastBudget),
      getRandomFloat(70, 95),
    ]
  );

  return true;
}

// ============================================================================
// MAIN
// ============================================================================

async function execute() {
  console.log('🚀 Predictive Planner – Data Rejuvenation Utility');
  console.log(`📊 Configuration: Org ID = ${CONFIG.organizationId}, Dry Run = ${CONFIG.dryRun}`);
  console.log('---');

  let connection;

  try {
    const masterData = await getMasterData();
    log(`Found ${masterData.roles.length} roles, ${masterData.rateCards.length} rate cards`);

    const ownerId = 1;
    const [userRows] = await pool.promise().query(
      'SELECT user_id FROM app_user WHERE user_id = ? LIMIT 1', [ownerId]
    );
    if (userRows.length === 0) log(`User ID ${ownerId} does not exist`, true);

    const stats = {
      projectsCreated: 0, projectsByTech: {},
      snapshotsCreated: 0, crsCreated: 0,
      completionRecordsCreated: 0, forecastsCreated: 0,
    };

    if (CONFIG.dryRun) {
      console.log('\n🔍 DRY RUN MODE – No data will be persisted\n');
    }

    connection = await pool.promise().getConnection();
    await connection.beginTransaction();

    let projectIndex = 0;
    for (const [techKey, techConfig] of Object.entries(TECH_STACKS)) {
      stats.projectsByTech[techKey] = 0;

      for (let i = 0; i < techConfig.projectCount; i++) {
        try {
          log(`[${techKey}] Generating project ${i + 1}/${techConfig.projectCount}...`);
          const project = await generateProject(projectIndex, techKey, masterData);

          if (!CONFIG.dryRun) {
            const projectId = await persistProject(connection, project, CONFIG.organizationId, ownerId);

            const snapshots = await generateProgressSnapshots(
              connection, CONFIG.organizationId, projectId,
              project.startDate, project.plannedEndDate, ownerId,
              project.budget, project.plannedEffort, project.estimatedTeamSize
            );
            const crs = await generateChangeRequests(
              connection, CONFIG.organizationId, projectId, 5, ownerId
            );
            await generateCompletionHistory(
              connection, CONFIG.organizationId, projectId, project, ownerId
            );
            const forecast = await generateForecastSnapshot(
              connection, CONFIG.organizationId, projectId, project
            );

            stats.projectsCreated++;
            stats.projectsByTech[techKey]++;
            stats.snapshotsCreated += snapshots;
            stats.crsCreated += crs;
            stats.completionRecordsCreated++;
            if (forecast) stats.forecastsCreated++;
          } else {
            stats.projectsCreated++;
            stats.projectsByTech[techKey]++;
          }

          projectIndex++;
        } catch (error) {
          console.error(`❌ Error generating project [${techKey}]:`, error.message);
          if (!CONFIG.dryRun) {
            await connection.rollback();
            throw error;
          }
        }
      }
    }

    if (!CONFIG.dryRun) await connection.commit();

    console.log('\n✅ Data Generation Summary:');
    console.log(`   Projects Created:       ${stats.projectsCreated}`);
    console.log(`   By Technology:`);
    for (const [tech, count] of Object.entries(stats.projectsByTech)) {
      if (count > 0) console.log(`      ${tech}: ${count}`);
    }
    console.log(`   Progress Snapshots:     ${stats.snapshotsCreated}`);
    console.log(`   Change Requests:        ${stats.crsCreated}`);
    console.log(`   Completion Records:     ${stats.completionRecordsCreated}`);
    console.log(`   Forecast Records:       ${stats.forecastsCreated}`);

    if (CONFIG.dryRun) {
      console.log('\n⚠️  DRY RUN COMPLETED – No changes made to database');
    } else {
      console.log('\n✨ Data Rejuvenation Successful!');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    if (connection && !CONFIG.dryRun) {
      try { await connection.rollback(); } catch (_) {}
    }
    process.exit(1);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

if (require.main === module) execute();
module.exports = { execute };
