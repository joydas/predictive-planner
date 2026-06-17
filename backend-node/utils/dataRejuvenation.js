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
 * - Calculated budgets (role-based rates)
 * - Project completion outcomes (40% on-time, 40% minor delay, 20% major delay)
 * - 0-5 change requests per project
 * - Monthly progress snapshots
 * - Team loading snapshots
 * - Completion history
 * - Forecast records
 */

const { pool } = require('../src/config/db.config');
const TenantContext = require('../src/utils/tenantContext');

const CONFIG = {
  organizationId: 1,
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
};

// Data definitions
const TECH_STACKS = {
  JAVA: {
    projectCount: 50,
    name: 'Java',
    stack: 'Java',
    roles: ['Java Developer', 'Java Lead', 'QA Lead', 'Manual Tester', 'Project Manager'],
  },
  REACT: {
    projectCount: 30,
    name: 'React',
    stack: 'React',
    roles: ['React Developer', 'React Lead', 'QA Lead', 'Automation Tester', 'Project Manager'],
  },
  DOTNET: {
    projectCount: 40,
    name: '.NET',
    stack: '.NET',
    roles: ['.NET Developer', '.NET Lead', 'QA Lead', 'Manual Tester', 'Project Manager'],
  },
  PYTHON: {
    projectCount: 40,
    name: 'Python',
    stack: 'Python',
    roles: ['Python Developer', 'Python Lead', 'QA Lead', 'DevOps Engineer', 'Project Manager'],
  },
  NODEJS: {
    projectCount: 20,
    name: 'Node.js',
    stack: 'NodeJS',
    roles: ['Node.js Developer', 'Node.js Lead', 'QA Lead', 'DevOps Engineer', 'Project Manager'],
  },
  SAP: {
    projectCount: 20,
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

const CLIENTS = ['Acme Corp', 'Global Retail', 'NextGen Bank', 'HealthOne', 'TechSphere', 'Innovate Ltd', 'Future Systems', 'Smart Solutions'];

const INDUSTRIES = ['BFSI', 'HEALTHCARE', 'RETAIL', 'TELECOM', 'TECHNOLOGY', 'MANUFACTURING'];

const DELIVERY_MODELS = ['Waterfall', 'Agile', 'Hybrid'];

const BUSINESS_CRITICALITY = ['Low', 'Medium', 'High', 'Critical'];

// Duration distribution: [3-6 months: 30%, 6-9 months: 50%, 9-12 months: 20%]
const DURATION_DISTRIBUTION = [
  { min: 90, max: 180, weight: 0.30 }, // 3-6 months
  { min: 180, max: 270, weight: 0.50 }, // 6-9 months
  { min: 270, max: 360, weight: 0.20 }, // 9-12 months
];

const COMPLETION_OUTCOMES = [
  { name: 'On Time', delayDays: 0, weight: 0.40 },
  { name: 'Minor Delay', delayDays: 15, weight: 0.40 },
  { name: 'Major Delay', delayDays: 45, weight: 0.20 },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(message, isWarning = false) {
  if (CONFIG.verbose || isWarning) {
    const prefix = isWarning ? '⚠️ ' : '✓ ';
    console.log(`${prefix} ${message}`);
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

// ============================================================================
// DATA GENERATION FUNCTIONS
// ============================================================================

async function getMasterData() {
  try {
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
  } catch (error) {
    console.error('Failed to fetch master data:', error.message);
    throw error;
  }
}

function buildTeamComposition(techStack, masterData) {
  const roleNames = TECH_STACKS[techStack].roles;
  const roleIdMap = {};

  // Map role names to role IDs
  for (const roleName of roleNames) {
    const roleRecord = masterData.roles.find(r => 
      r.role_name.toLowerCase().includes(roleName.toLowerCase().split(' ')[0])
    );
    if (roleRecord) {
      roleIdMap[roleName] = roleRecord.role_id;
    }
  }

  // Build team with realistic counts
  const teamRows = [];
  const leadRole = roleNames.find(r => r.includes('Lead'));
  const devRoles = roleNames.filter(r => r.includes('Developer') || r.includes('Consultant'));
  const qaRoles = roleNames.filter(r => r.includes('QA'));
  const testRoles = roleNames.filter(r => r.includes('Tester'));
  const devOpsRoles = roleNames.filter(r => r.includes('DevOps'));
  const pmRoles = roleNames.filter(r => r.includes('Project Manager'));

  // Add team members
  if (leadRole && roleIdMap[leadRole]) {
    teamRows.push({
      roleId: roleIdMap[leadRole],
      roleName: leadRole,
      count: 1,
      locationType: 'ONSITE',
      allocationPercent: 100,
    });
  }

  devRoles.forEach(role => {
    if (roleIdMap[role]) {
      teamRows.push({
        roleId: roleIdMap[role],
        roleName: role,
        count: getRandomNumber(3, 8),
        locationType: getRandomItem(['ONSITE', 'OFFSHORE', 'HYBRID']),
        allocationPercent: 100,
      });
    }
  });

  qaRoles.forEach(role => {
    if (roleIdMap[role]) {
      teamRows.push({
        roleId: roleIdMap[role],
        roleName: role,
        count: getRandomNumber(2, 4),
        locationType: getRandomItem(['ONSITE', 'OFFSHORE']),
        allocationPercent: 100,
      });
    }
  });

  testRoles.forEach(role => {
    if (roleIdMap[role]) {
      teamRows.push({
        roleId: roleIdMap[role],
        roleName: role,
        count: getRandomNumber(1, 3),
        locationType: 'OFFSHORE',
        allocationPercent: 100,
      });
    }
  });

  devOpsRoles.forEach(role => {
    if (roleIdMap[role]) {
      teamRows.push({
        roleId: roleIdMap[role],
        roleName: role,
        count: 1,
        locationType: 'HYBRID',
        allocationPercent: 100,
      });
    }
  });

  pmRoles.forEach(role => {
    if (roleIdMap[role]) {
      teamRows.push({
        roleId: roleIdMap[role],
        roleName: role,
        count: 1,
        locationType: 'ONSITE',
        allocationPercent: 100,
      });
    }
  });

  return teamRows;
}

function calculateBudget(teamRows, durationDays, rateCards, startDate, endDate) {
  let totalCost = 0;
  let totalEffort = 0;

  for (const row of teamRows) {
    const rateCard = rateCards.find(rc => rc.role_id === row.roleId);
    const dailyRate = rateCard ? rateCard.rate_per_day : 500; // Fallback rate

    // Enrich row with keys expected by the UI and repository
    row.role = row.roleName;
    row.startDate = toDateOnly(startDate);
    row.endDate = toDateOnly(endDate);
    row.ratePerDay = dailyRate;
    row.durationDays = Math.ceil(durationDays);
    row.workingDays = Math.ceil(durationDays * (5 / 7)); // Approximation of working days
    row.plannedEffort = row.count * row.workingDays;
    row.plannedCost = row.plannedEffort * dailyRate;

    totalCost += row.plannedCost;
    totalEffort += row.plannedEffort;
  }

  return {
    budget: Math.ceil(totalCost),
    plannedEffort: Math.ceil(totalEffort),
    estimatedTeamSize: teamRows.reduce((sum, r) => sum + r.count, 0),
  };
}

async function generateProject(index, techKey, masterData) {
  const startDate = addDays(new Date('2023-01-01'), getRandomNumber(0, 730));
  const durationDays = getWeightedRandom(DURATION_DISTRIBUTION);
  const plannedEndDate = addDays(startDate, getRandomNumber(durationDays.min, durationDays.max));

  const teamRows = buildTeamComposition(techKey, masterData);
  const { budget, plannedEffort, estimatedTeamSize } = calculateBudget(
    teamRows,
    (plannedEndDate - startDate) / (1000 * 60 * 60 * 24),
    masterData.rateCards,
    startDate,
    plannedEndDate
  );

  const completionOutcome = getWeightedRandom(COMPLETION_OUTCOMES);
  const actualCompletionDate = addDays(plannedEndDate, completionOutcome.delayDays);

  const projectName = generateProjectName(techKey, index);
  const industryRecord = getRandomItem(masterData.industries);

  return {
    projectName,
    clientName: getRandomItem(CLIENTS),
    industry: industryRecord.industry_name,
    industryCode: industryRecord.industry_code,
    projectType: getRandomItem(['Greenfield', 'Brownfield', 'Maintenance']),
    deliveryModel: getRandomItem(DELIVERY_MODELS),
    businessCriticality: getRandomItem(BUSINESS_CRITICALITY),
    technologyStack: TECH_STACKS[techKey].stack,
    complexity: getRandomNumber(1, 5),
    pmEstimatedValue: plannedEffort,
    budget,
    estimatedTeamSize,
    plannedEffort,
    startDate: toDateOnly(startDate),
    plannedEndDate: toDateOnly(plannedEndDate),
    actualCompletionDate: toDateOnly(actualCompletionDate),
    completionOutcome,
    teamRows,
  };
}

async function persistProject(connection, project, organizationId, ownerId) {
  const [result] = await connection.query(
    `INSERT INTO project 
     (organization_id, owner_id, project_name, client_name, industry, industry_code, 
      project_type, delivery_model, business_criticality, technology_stack, 
      architecture_type, cloud_platform, complexity, estimated_team_size, 
      planned_effort, budget, billing_model, start_date, planned_end_date, 
      pm_estimated_value, workflow_status, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'APPROVED')`,
    [organizationId, ownerId, project.projectName, project.clientName, project.industry,
     project.industryCode, project.projectType, project.deliveryModel, project.businessCriticality || 'Medium',
     project.technologyStack, project.architectureType || 'Microservices', project.cloudPlatform || 'AWS',
     project.complexity, project.estimatedTeamSize, project.plannedEffort, project.budget,
     project.billingModel || 'Time & Material', project.startDate, project.plannedEndDate,
     project.pmEstimatedValue]
  );

  const projectId = result.insertId;
  await connection.query(
    "UPDATE project SET project_code = CONCAT('PRJ-', LPAD(project_id, 6, '0')) WHERE project_id = ?",
    [projectId]
  );

  return projectId;
}

async function generateProgressSnapshots(connection, orgId, projectId, startDate, endDate, ownerId) {
  const snapshots = [];
  const durationDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
  const monthCount = Math.ceil(durationDays / 30);

  let currentDate = new Date(startDate);
  let previousPercent = 0;

  for (let month = 0; month < monthCount; month++) {
    const snapshotDate = toDateOnly(addDays(currentDate, month * 30));

    // Generate realistic non-linear progress
    const monthProgress = (month + 1) / monthCount;
    const baseProgress = monthProgress * 100;
    const variation = getRandomFloat(-5, 10);
    let completionPercent = Math.min(100, Math.max(previousPercent, baseProgress + variation));

    snapshots.push({
      projectId,
      snapshotDate,
      actualEffortPd: completionPercent * 0.8, // Effort trails slightly behind
      actualBudget: completionPercent * 0.7,
      actualTeamSize: getRandomFloat(0.6, 1.0),
      actualCompletionPercent: completionPercent,
      remarks: `Progress update - ${completionPercent.toFixed(0)}% complete`,
      createdBy: ownerId,
    });

    previousPercent = completionPercent;
  }

  for (const snapshot of snapshots) {
    await connection.query(
      `INSERT INTO project_progress_snapshot 
       (organization_id, project_id, snapshot_date, actual_effort_pd, actual_budget, actual_team_size, actual_completion_percent, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orgId, snapshot.projectId, snapshot.snapshotDate, snapshot.actualEffortPd, snapshot.actualBudget,
       snapshot.actualTeamSize, snapshot.actualCompletionPercent, snapshot.remarks, snapshot.createdBy]
    );
  }

  return snapshots.length;
}

async function generateChangeRequests(connection, orgId, projectId, crCount, ownerId) {
  const crCountActual = getRandomNumber(0, crCount || 5);
  if (crCountActual === 0) return 0;

  let created = 0;

  for (let i = 0; i < crCountActual; i++) {
    const effortImpact = getRandomNumber(10, 100);
    const budgetImpact = getRandomNumber(5000, 50000);
    const teamSizeImpact = getRandomNumber(1, 5);

    const [result] = await connection.query(
      `INSERT INTO change_request 
       (organization_id, project_id, cr_code, cr_title, cr_description, cr_category, severity, 
        priority, status, effort_impact, budget_impact, team_size_impact, submitted_by_user_id, workflow_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orgId, projectId, 
       `CR-${String(i + 1).padStart(3, '0')}`,
       `Change Request ${i + 1}`,
       `Realistic change request for project maintenance and enhancement`,
       getRandomItem(['Enhancement', 'Defect Fix', 'Performance', 'Security']),
       getRandomItem(['Low', 'Medium', 'High']),
       getRandomItem(['Low', 'Medium', 'High', 'Critical']),
       'APPROVED', effortImpact, budgetImpact, teamSizeImpact, ownerId, 'APPROVED']
    );

    created++;
  }

  return created;
}

async function generateCompletionHistory(connection, orgId, projectId, project, ownerId) {
  const actualEffort = project.plannedEffort * getRandomFloat(0.8, 1.2);
  const actualBudget = project.budget * getRandomFloat(0.85, 1.15);

  // Create a draft record first (required for completion_history)
  const [draftResult] = await connection.query(
    `INSERT INTO project_drafts (organization_id, owner_id, draft_data, status, workflow_status, submitted_by_user_id, is_published, published_project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, ownerId, 
     JSON.stringify({
       projectName: project.projectName,
       teamRows: project.teamRows,
       technologyStack: project.technologyStack,
     }),
     'PUBLISHED',
     'APPROVED',
     ownerId,
     1,
     projectId]
  );
  const sourceDraftId = draftResult.insertId;

  // Link draft back to project to avoid "DRF-" prefixes and duplicate records in admin view
  await connection.query(
    'UPDATE project SET source_draft_id = ? WHERE project_id = ?',
    [sourceDraftId, projectId]
  );

  await connection.query(
    `INSERT INTO project_completion_history 
     (organization_id, project_id, source_draft_id, completed_by_user_id, final_resource_loading, management_cost, contingency_cost, 
      resource_cost, full_project_cost, actual_final_estimated_value, completion_payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, projectId, sourceDraftId, ownerId, 
     JSON.stringify(project.teamRows),
     project.budget * 0.05,
     project.budget * 0.10,
     actualBudget * 0.85,
     actualBudget,
     actualEffort,
     JSON.stringify({
       projectName: project.projectName,
       completionOutcome: project.completionOutcome.name,
       actualEffort,
       actualBudget,
     })]
  );

  return true;
}

async function generateForecastSnapshot(connection, orgId, projectId, project, ownerId) {
  // Generate limited forecast records (50% of projects)
  if (Math.random() > 0.5) return false;

  const forecastEffort = project.plannedEffort * getRandomFloat(0.9, 1.1);
  const forecastBudget = project.budget * getRandomFloat(0.9, 1.1);
  const forecastDate = addDays(new Date(project.startDate), getRandomNumber(30, 90));
  const forecastCompletionDate = addDays(new Date(project.plannedEndDate), getRandomNumber(-10, 20));
  const delayDays = (forecastCompletionDate - new Date(project.plannedEndDate)) / (1000 * 60 * 60 * 24);
  const confidence = getRandomFloat(70, 95);

  await connection.query(
    `INSERT INTO project_forecast_snapshot 
     (organization_id, project_id, snapshot_date, forecast_completion_date, forecast_delay_days, forecast_final_effort, forecast_final_budget, forecast_confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, projectId, toDateOnly(forecastDate), toDateOnly(forecastCompletionDate), delayDays, forecastEffort, forecastBudget, confidence]
  );

  return true;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function execute() {
  console.log('🚀 Predictive Planner – Data Rejuvenation Utility');
  console.log(`📊 Configuration: Organization ID = ${CONFIG.organizationId}, Dry Run = ${CONFIG.dryRun}`);
  console.log('---');

  let connection;

  try {
    // Set tenant context
    //TenantContext.setOrganizationId(CONFIG.organizationId);

    // Get master data
    log('Fetching master data...');
    const masterData = await getMasterData();
    log(`Found ${masterData.roles.length} roles, ${masterData.rateCards.length} rate cards`);

    // Get or create test user
    let ownerId = 1; // Default owner ID
    const [userRows] = await pool.promise().query(
      'SELECT user_id FROM app_user WHERE user_id = ? LIMIT 1',
      [ownerId]
    );
    if (userRows.length === 0) {
      log(`User ID ${ownerId} does not exist, will use as-is`, true);
    }

    // Initialize counters
    const stats = {
      projectsCreated: 0,
      projectsByTech: {},
      snapshotsCreated: 0,
      crsCreated: 0,
      completionRecordsCreated: 0,
      forecastsCreated: 0,
    };

    if (CONFIG.dryRun) {
      console.log('\n🔍 DRY RUN MODE – No data will be persisted\n');
    }

    // Generate projects
    connection = await pool.promise().getConnection();
    await connection.beginTransaction();

    let projectIndex = 0;
    for (const [techKey, techConfig] of Object.entries(TECH_STACKS)) {
      stats.projectsByTech[techKey] = 0;

      for (let i = 0; i < techConfig.projectCount; i++) {
        try {
          log(`[${techKey}] Generating project ${i + 1}/${techConfig.projectCount}...`);

          // Generate project data
          const project = await generateProject(projectIndex, techKey, masterData);

          if (!CONFIG.dryRun) {
            // Persist project
            const projectId = await persistProject(connection, project, CONFIG.organizationId, ownerId);

            // Generate related data
            await generateProgressSnapshots(connection, CONFIG.organizationId, projectId, project.startDate, project.plannedEndDate, ownerId);
            const crsCreated = await generateChangeRequests(connection, CONFIG.organizationId, projectId, 5, ownerId);
            await generateCompletionHistory(connection, CONFIG.organizationId, projectId, project, ownerId);
            const forecastCreated = await generateForecastSnapshot(connection, CONFIG.organizationId, projectId, project, ownerId);

            // Update stats
            stats.projectsCreated++;
            stats.projectsByTech[techKey]++;
            stats.snapshotsCreated += Math.ceil(((new Date(project.plannedEndDate) - new Date(project.startDate)) / (1000 * 60 * 60 * 24)) / 30);
            stats.crsCreated += crsCreated;
            stats.completionRecordsCreated++;
            if (forecastCreated) stats.forecastsCreated++;
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

    // Commit transaction
    if (!CONFIG.dryRun) {
      await connection.commit();
    }

    console.log('\n✅ Data Generation Summary:');
    console.log(`   Projects Created:          ${stats.projectsCreated}`);
    console.log(`   By Technology:`);
    for (const [tech, count] of Object.entries(stats.projectsByTech)) {
      if (count > 0) console.log(`      ${tech}: ${count}`);
    }
    console.log(`   Progress Snapshots:        ${stats.snapshotsCreated}`);
    console.log(`   Change Requests:           ${stats.crsCreated}`);
    console.log(`   Completion Records:        ${stats.completionRecordsCreated}`);
    console.log(`   Forecast Records:          ${stats.forecastsCreated}`);

    if (CONFIG.dryRun) {
      console.log('\n⚠️  DRY RUN COMPLETED – No changes made to database');
    } else {
      console.log('\n✨ Data Rejuvenation Successful!');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    if (connection && !CONFIG.dryRun) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError.message);
      }
    }
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Execute
if (require.main === module) {
  execute();
}

module.exports = { execute };
