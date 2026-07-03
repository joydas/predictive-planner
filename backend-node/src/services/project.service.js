const { pool } = require('../config/db.config');
const projectRepository = require('../repositories/project.repository');
const workflowService = require('../workflow/workflow.service');
const { normalizeStatus, validateTransition } = require('../workflow/workflow.validator');
const mlPredictionService = require('./mlPrediction.service');
const masterDataRepository = require('../repositories/masterData.repository');
const forecastService = require('./forecastService');
const notificationService = require('./notification.service');
const userRepository = require('../repositories/user.repository');

function normalizeNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireNonNegativeNumber(value, label, { required = false } = {}) {
  if (value === '' || value === null || value === undefined) {
    if (!required) return 0;
    const error = new Error(`${label} is required`);
    error.status = 400;
    throw error;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    const error = new Error(`${label} must be a non-negative number`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function addCalendarDays(dateValue, days = 0) {
  const base = toDateOnly(dateValue);
  if (!base) return null;
  const date = new Date(`${base}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + Number(days || 0));
  return toDateOnly(date);
}

function requirePercentInRange(value, label, { required = false } = {}) {
  const parsed = requireNonNegativeNumber(value, label, { required });
  if (parsed > 100) {
    const error = new Error(`${label} cannot be more than 100`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function getWorkingDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }

  let workingDays = 0;
  const current = new Date(start);
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      workingDays += 1;
    }
    current.setDate(current.getDate() + 1);
  }
  return workingDays;
}

function getRateForRole(roleId, locationType, rateCards = []) {
  const match = (rateCards || []).find((card) =>
    String(card.roleId) === String(roleId) && card.locationType === locationType
  );
  return normalizeNumber(match?.ratePerDay, 0);
}

function deriveResourcePlanning(payload) {
  const financial = payload.financial || {};
  const rateCards = financial.rateCards || [];
  const rows = (payload.teamComposition?.rows || []).map((row) => {
    const count = normalizeNumber(row.count, 0);
    const allocationPercent = normalizeNumber(row.allocationPercent ?? row.allocation ?? 100, 0);
    const locationType = row.locationType || 'ONSITE';
    const ratePerDay = normalizeNumber(row.ratePerDay, getRateForRole(row.roleId, locationType, rateCards));
    const workingDays = getWorkingDays(row.startDate, row.endDate);
    const plannedEffort = count * (allocationPercent / 100) * workingDays;
    const plannedCost = plannedEffort * ratePerDay;

    return {
      ...row,
      locationType,
      allocationPercent,
      ratePerDay,
      durationDays: workingDays,
      workingDays,
      plannedEffort,
      plannedCost,
    };
  });

  const baseResourceCost = rows.reduce((sum, row) => sum + normalizeNumber(row.plannedCost, 0), 0);
  const plannedEffort = rows.reduce((sum, row) => sum + normalizeNumber(row.plannedEffort, 0), 0);
  const estimatedTeamSize = rows.reduce((sum, row) => sum + normalizeNumber(row.count, 0), 0);
  const reservePercent = normalizeNumber(financial.management_reserve_percent, 0)
    + normalizeNumber(financial.contingency_reserve_percent, 0);

  return {
    rows,
    baseResourceCost,
    plannedEffort,
    estimatedTeamSize,
    budget: baseResourceCost * (1 + reservePercent / 100),
  };
}

function validateResourceDates(payload) {
  const projectStart = payload.deliveryDetails?.start_date;
  const projectEnd = payload.deliveryDetails?.planned_end_date;

  (payload.teamComposition?.rows || []).forEach((row, index) => {
    if (!row.roleId && !row.role) {
      const error = new Error(`Resource row ${index + 1} role is required`);
      error.status = 400;
      throw error;
    }
    if (!['ONSITE', 'OFFSHORE'].includes(row.locationType || 'ONSITE')) {
      const error = new Error(`Resource row ${index + 1} location type must be ONSITE or OFFSHORE`);
      error.status = 400;
      throw error;
    }
    if (projectStart && row.startDate && row.startDate < projectStart) {
      const error = new Error(`Resource row ${index + 1} cannot start before project start date`);
      error.status = 400;
      throw error;
    }
    if (projectEnd && row.endDate && row.endDate > projectEnd) {
      const error = new Error(`Resource row ${index + 1} cannot end after project end date`);
      error.status = 400;
      throw error;
    }
    if (row.startDate && row.endDate && row.endDate < row.startDate) {
      const error = new Error(`Resource row ${index + 1} end date cannot be before start date`);
      error.status = 400;
      throw error;
    }
  });
}

function normalizeResourceRows(payload) {
  const projectStart = payload.deliveryDetails?.start_date || '';
  const projectEnd = payload.deliveryDetails?.planned_end_date || '';
  return (payload.teamComposition?.rows || []).map((row) => ({
    ...row,
    locationType: row.locationType || 'ONSITE',
    startDate: row.startDate || projectStart,
    endDate: row.endDate || projectEnd,
  }));
}

function calculateAverageExperience(teamComposition) {
  if (!Array.isArray(teamComposition) || teamComposition.length === 0) {
    return 0;
  }

  const validValues = teamComposition
    .map((row) => normalizeNumber(row.avgExperience, 0))
    .filter((value) => value > 0);

  if (validValues.length === 0) {
    return 0;
  }

  return validValues.reduce((sum, next) => sum + next, 0) / validValues.length;
}

function sumObjectValues(value = {}) {
  return Object.values(value || {}).reduce((sum, next) => sum + normalizeNumber(next, 0), 0);
}

function getCalendarDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${toDateOnly(startDate)}T00:00:00`);
  const end = new Date(`${toDateOnly(endDate)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
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

function extractPmEstimatedValue(payload = {}) {
  return normalizeNumber(
    payload.basicInfo?.pm_estimated_value
      ?? payload.basicInfo?.pmEstimatedValue
      ?? payload.estimation?.pmEstimatedValue,
    0,
  );
}

function extractAiEstimatedValue(payload = {}) {
  const existing = payload.baselineTracking?.estimation || payload.estimation || {};
  const recommendation = payload.mlRecommendation?.recommendation || {};
  return normalizeNumber(
    recommendation.estimation?.recommendedValue
      ?? recommendation.estimation?.estimatedValue
      ?? existing.aiEstimatedValue
      ?? existing.ai_estimated_value,
    null,
  );
}

function extractAiBaselineFromPayload(payload = {}) {
  const existing = payload.baselineTracking?.ai || payload.mlRecommendation?.aiBaseline || {};
  const recommendation = payload.mlRecommendation?.recommendation || {};
  const snapshot = recommendation.baselineSnapshot || {};
  const recommendedTeam = recommendation.staffing?.recommendedTeam || {};
  const hasRecommendedTeam = Object.keys(recommendedTeam).length > 0;
  const effort = snapshot.effort
    ?? snapshot.plannedEffort
    ?? existing.effort
    ?? recommendation.effort?.predictedHours
    ?? null;
  const budget = snapshot.budget ?? existing.budget ?? null;
  const teamSize = snapshot.teamSize
    ?? snapshot.estimatedTeamSize
    ?? existing.teamSize
    ?? (hasRecommendedTeam ? sumObjectValues(recommendedTeam) : null);

  if (effort === null && budget === null && teamSize === null) {
    return existing;
  }

  return {
    effort: effort === null || effort === undefined ? null : normalizeNumber(effort, null),
    budget: budget === null || budget === undefined ? null : normalizeNumber(budget, null),
    teamSize: teamSize === null || teamSize === undefined ? null : normalizeNumber(teamSize, null),
  };
}

function normalizeProjectPayload(payload) {
  if (payload && payload.basicInfo) {
    return {
      ...payload,
      basicInfo: {
        ...payload.basicInfo,
        project_name: String(payload.basicInfo.project_name || '').trim(),
        client_name: String(payload.basicInfo.client_name || '').trim(),
        industry: String(payload.basicInfo.industry || '').trim(),
        industry_code: String(payload.basicInfo.industry_code || payload.basicInfo.industryCode || '').trim(),
        project_type: String(payload.basicInfo.project_type || '').trim(),
        delivery_model: String(payload.basicInfo.delivery_model || '').trim(),
        business_criticality: String(payload.basicInfo.business_criticality || '').trim(),
      },
    };
  }

  const legacyName = String(payload.name || '').trim();

  return {
    basicInfo: {
      project_name: legacyName || 'Legacy Project',
      client_name: payload.clientName || payload.client_name || '',
      industry: '',
      project_type: '',
      delivery_model: '',
      pm_estimated_value: payload.pm_estimated_value || payload.estimated_value || '',
    },
    deliveryDetails: {
      start_date: '',
      planned_end_date: '',
      sprint_length: '',
      release_frequency: '',
      milestone_count: '',
    },
    teamComposition: {
      rows: [],
      locations: '',
      offshoreOnshoreRatio: '',
    },
    technology: {
      technology_stack: payload.technology || '',
      architecture_type: '',
      cloud_platform: '',
      integration_count: payload.technology_score || 0,
      complexity: payload.complexity || 1,
    },
    financial: {
      management_reserve_percent: '',
      contingency_reserve_percent: '',
      billing_model: '',
      rateCards: [],
      budget: '',
      planned_effort: payload.estimated_hours || 0,
      estimated_team_size: payload.team_size || 1,
    },
    risks: {
      dependency_count: '',
      compliance_requirements: '',
      criticality: '',
      requirement_stability_index: '',
    },
  };
}

function validateProjectSubmitPayload(payload) {
  const projectName = String(payload.basicInfo?.project_name || '').trim();
  if (!projectName) {
    const error = new Error('Project name is required');
    error.status = 400;
    throw error;
  }

  const clientName = String(payload.basicInfo?.client_name || '').trim();
  if (!clientName) {
    const error = new Error('Client name is required');
    error.status = 400;
    throw error;
  }
}

async function normalizeIndustrySelection(payload) {
  if (!payload?.basicInfo) return payload;

  const basicInfo = payload.basicInfo || {};
  const rawCode = String(basicInfo.industry_code || basicInfo.industryCode || '').trim();
  const rawIndustry = String(basicInfo.industry || '').trim();
  const industries = await masterDataRepository.listIndustries();
  const match = industries.find((industry) =>
    String(industry.industryCode).toLowerCase() === rawCode.toLowerCase()
    || String(industry.industryName).toLowerCase() === rawIndustry.toLowerCase()
  );

  if (!match) {
    return {
      ...payload,
      basicInfo: {
        ...basicInfo,
        industry: rawIndustry,
        industry_code: rawCode,
      },
    };
  }

  return {
    ...payload,
    basicInfo: {
      ...basicInfo,
      industry: match.industryName,
      industry_code: match.industryCode,
    },
  };
}

function isCompleteResourceRow(row) {
  return Boolean(row?.roleId || row?.role) && Boolean(row?.count) && Number(row.count) > 0;
}

function assertPmUser(user) {
  if (String(user?.role || '').toUpperCase() !== 'PM') {
    const error = new Error('Only Project Managers may create or update project drafts');
    error.status = 403;
    throw error;
  }
}

async function applyDerivedPlanning(payload, { requireResourceLoading = false } = {}) {
  if (!payload?.basicInfo) return payload;
  const industryNormalizedPayload = await normalizeIndustrySelection(payload);
  const rateCards = await masterDataRepository.listRateCards();
  const financial = industryNormalizedPayload.financial || {};
  requirePercentInRange(financial.management_reserve_percent, 'Management reserve', { required: requireResourceLoading });
  requirePercentInRange(financial.contingency_reserve_percent, 'Contingency reserve', { required: requireResourceLoading });
  const normalizedRows = normalizeResourceRows(industryNormalizedPayload).filter((row) =>
    requireResourceLoading || isCompleteResourceRow(row)
  );
  if (requireResourceLoading && normalizedRows.length === 0) {
    const error = new Error('At least one resource loading row is required before submission');
    error.status = 400;
    throw error;
  }
  const normalizedPayload = {
    ...industryNormalizedPayload,
    teamComposition: {
      ...(industryNormalizedPayload.teamComposition || {}),
      rows: normalizedRows,
    },
    financial: {
      ...(industryNormalizedPayload.financial || {}),
      rateCards,
    },
  };
  validateResourceDates(normalizedPayload);
  const derivedPlanning = deriveResourcePlanning(normalizedPayload);
  return {
    ...normalizedPayload,
    teamComposition: {
      ...payload.teamComposition,
      rows: derivedPlanning.rows,
    },
    financial: {
      ...industryNormalizedPayload.financial,
      planned_effort: Number(derivedPlanning.plannedEffort.toFixed(2)),
      estimated_team_size: Number(derivedPlanning.estimatedTeamSize.toFixed(2)),
      base_resource_cost: Number(derivedPlanning.baseResourceCost.toFixed(2)),
      budget: Number(derivedPlanning.budget.toFixed(2)),
    },
  };
}

function buildLegacyProjectRecord(rawPayload, ownerId) {
  const payload = normalizeProjectPayload(rawPayload);
  const technologyScore = normalizeNumber(payload.technology.integration_count, 0);
  const avgExperience = calculateAverageExperience(payload.teamComposition.rows);

  return {
    name: payload.basicInfo.project_name || 'Untitled Project',
    business_unit: payload.basicInfo.client_name || 'Unknown Client',
    technology: payload.technology.technology_stack || 'Unknown',
    complexity: normalizeNumber(payload.technology.complexity, 1),
    team_size: normalizeNumber(payload.financial.estimated_team_size, 1),
    estimated_hours: normalizeNumber(payload.financial.planned_effort, 0),
    avg_experience: normalizeNumber(avgExperience, 0),
    technology_score: technologyScore,
    created_by: ownerId,
  };
}

async function createDraft(user, draftData) {
  assertPmUser(user);
  return projectRepository.createLifecycleProjectDraft(user.userId, user.organizationId, await applyDerivedPlanning(draftData));
}

async function updateDraft(draftId, user, draftData) {
  assertPmUser(user);
  const lifecycleProject = await projectRepository.getLifecycleProjectDraftById(draftId, user.userId, user.organizationId);
  if (!lifecycleProject) {
    const error = new Error('Project not found or not owned by user');
    error.status = 404;
    throw error;
  }
  const status = String(lifecycleProject.workflowStatus || lifecycleProject.status || '').toUpperCase();
  if (!['DRAFT', 'RETURNED', 'REJECTED'].includes(status)) {
    const error = new Error('Only draft, returned, or rejected projects can be edited');
    error.status = 400;
    throw error;
  }
  return projectRepository.updateLifecycleProjectDraft(draftId, user.userId, user.organizationId, await applyDerivedPlanning(draftData));
}

async function getDraft(ownerId, draftId, organizationId) {
  const lifecycleProject = await projectRepository.getLifecycleProjectDraftById(draftId, ownerId, organizationId);
  if (!lifecycleProject) {
    const error = new Error('Draft not found');
    error.status = 404;
    throw error;
  }
  return {
    draftId: lifecycleProject.projectId,
    projectId: lifecycleProject.projectId,
    draftData: lifecycleProject.draftData,
    status: lifecycleProject.status,
    workflowStatus: lifecycleProject.workflowStatus,
    recordType: 'PROJECT',
    ownerId: lifecycleProject.ownerId,
    createdAt: lifecycleProject.createdAt,
    updatedAt: lifecycleProject.updatedAt,
  };
}

async function listProjects() {
  return projectRepository.findProjects();
}

async function listProjectsForPm(user, query) {
  return projectRepository.findProjectsForPm({
    userId: user.userId,
    role: user.role,
    organizationId: user.organizationId,
    page: query.page,
    pageSize: query.pageSize,
    search: String(query.search || '').trim(),
    status: String(query.status || '').trim().toUpperCase(),
    industry: String(query.industry || '').trim(),
    deliveryModel: String(query.deliveryModel || query.delivery_model || '').trim(),
    createdFrom: String(query.createdFrom || query.created_from || '').trim(),
    createdTo: String(query.createdTo || query.created_to || '').trim(),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
}

async function createProject(user, projectPayload) {
  return submitProject(user, projectPayload, null);
}

async function transitionLifecycleProject(project, user, actionType, comment) {
  const fromStatus = normalizeStatus(project.workflowStatus || project.status);
  const transition = validateTransition({
    fromStatus,
    actionType,
    role: user.role,
    comment,
  });
  const trimmedComment = String(comment).trim();
  const connection = await pool.promise().getConnection();
  try {
    await connection.beginTransaction();
    await projectRepository.transitionLifecycleProjectInTransaction(
      connection,
      project.projectId,
      { ...transition, fromStatus },
      user,
      trimmedComment,
    );
    if (transition.toStatus === 'APPROVED') {
      await projectRepository.insertProjectTeamSnapshotsIfMissing(
        connection,
        project.projectId,
        project.draftData?.teamComposition?.rows || [],
        project.organizationId,
      );
    }
    await connection.commit();

    // Notifications
    const projectName = project.draftData?.basicInfo?.project_name || project.name || `Project ${project.projectId}`;
    if (transition.toStatus === 'SUBMITTED') {
      await notificationService.notifyProjectUpdate(project, 'PROJECT_SUBMITTED', 'Project Submitted', `Project "${projectName}" has been submitted for approval.`);
    } else if (transition.toStatus === 'APPROVED') {
      await notificationService.notifyProjectUpdate(project, 'PROJECT_APPROVED', 'Project Approved', `Project "${projectName}" has been approved.`);
    } else if (transition.toStatus === 'RETURNED') {
      await notificationService.notifyProjectUpdate(project, 'PROJECT_REJECTED', 'Project Returned', `Project "${projectName}" has been returned for revisions.`);
    } else if (transition.toStatus === 'REJECTED') {
      await notificationService.notifyProjectUpdate(project, 'PROJECT_REJECTED', 'Project Rejected', `Project "${projectName}" has been rejected.`);
    }

    return {
      entityId: project.projectId,
      fromStatus,
      toStatus: transition.toStatus,
      actionType: transition.actionType,
      latestComment: trimmedComment,
      publishedProjectId: transition.toStatus === 'APPROVED' ? project.projectId : undefined,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function submitProject(user, projectData, draftId = null, comment = '') {
  assertPmUser(user);
  const ownerId = user.userId;
  const organizationId = user.organizationId;
  const payload = await applyDerivedPlanning(normalizeProjectPayload(projectData), { requireResourceLoading: true });
  validateProjectSubmitPayload(payload);
  validateResourceDates(payload);
  const derivedPlanning = deriveResourcePlanning(payload);
  const avgExperience = calculateAverageExperience(payload.teamComposition.rows);

  const finalPayload = {
    ...payload,
    baselineTracking: {
      ...(payload.baselineTracking || {}),
      ai: extractAiBaselineFromPayload(payload),
      pm: {
        effort: Number(derivedPlanning.plannedEffort.toFixed(2)),
        budget: Number(derivedPlanning.budget.toFixed(2)),
        teamSize: Number(derivedPlanning.estimatedTeamSize.toFixed(2)),
      },
      estimation: {
        ...(payload.baselineTracking?.estimation || {}),
        pmEstimatedValue: Number(extractPmEstimatedValue(payload).toFixed(2)),
        aiEstimatedValue: extractAiEstimatedValue(payload),
      },
    },
    teamComposition: {
      ...payload.teamComposition,
      rows: derivedPlanning.rows,
    },
    financial: {
      ...payload.financial,
      planned_effort: Number(derivedPlanning.plannedEffort.toFixed(2)),
      estimated_team_size: Number(derivedPlanning.estimatedTeamSize.toFixed(2)),
      base_resource_cost: Number(derivedPlanning.baseResourceCost.toFixed(2)),
      budget: Number(derivedPlanning.budget.toFixed(2)),
    },
    _legacy: {
      name: payload.basicInfo.project_name || 'Untitled Project',
      business_unit: payload.basicInfo.client_name || 'Unknown Client',
      technology: payload.technology.technology_stack || 'Unknown',
      complexity: normalizeNumber(payload.technology.complexity, 1),
      team_size: normalizeNumber(derivedPlanning.estimatedTeamSize, 1),
      estimated_hours: normalizeNumber(derivedPlanning.plannedEffort, 0),
      avg_experience: normalizeNumber(avgExperience, 0),
      technology_score: normalizeNumber(payload.technology.integration_count, 0),
      created_by: ownerId,
    },
  };

  await mlPredictionService.recordPredictionFeedback({
    projectDraftId: draftId || payload.draftId || null,
    projectData: finalPayload,
  });

  if (draftId) {
    const lifecycleProject = await projectRepository.getLifecycleProjectDraftById(draftId, ownerId, organizationId);
    if (!lifecycleProject) {
      const error = new Error('Project not found, not owned by user, or not editable');
      error.status = 404;
      throw error;
    }
    
    const updated = await projectRepository.updateLifecycleProjectDraft(draftId, ownerId, organizationId, finalPayload);
    if (!updated) {
      const error = new Error('Project not found or not editable');
      error.status = 404;
      throw error;
    }
    const refreshedProject = await projectRepository.getLifecycleProjectDraftById(draftId, ownerId, organizationId);
    const transition = await transitionLifecycleProject(refreshedProject, user, 'SUBMIT', comment);
    return {
      projectId: draftId,
      draftId,
      transition,
      ...finalPayload,
    };
  } else {
    const created = await projectRepository.createLifecycleProjectDraft(ownerId, organizationId, finalPayload, 'DRAFT');
    const lifecycleProject = await projectRepository.getLifecycleProjectDraftById(created.projectId, ownerId, organizationId);
    const transition = await transitionLifecycleProject(lifecycleProject, user, 'SUBMIT', comment);
    return {
      projectId: created.projectId,
      draftId: created.projectId,
      transition,
      ...finalPayload,
    };
  }
}

function normalizeCompletionPayload(payload = {}) {
  const resourceLoading = Array.isArray(payload.resourceLoading) ? payload.resourceLoading : [];
  const actuals = payload.actuals || payload.financialActuals || {};
  const groundMetrics = payload.groundMetrics || payload.metrics || {};
  const finalResourceLoading = resourceLoading.map((row) => {
    const count = requireNonNegativeNumber(row.count, 'Final resource count', { required: true });
    const rate = requireNonNegativeNumber(row.rate ?? row.ratePerDay, 'Final resource rate', { required: true });
    const effort = requireNonNegativeNumber(row.effort, 'Final resource effort', { required: true });
    return {
      role: String(row.role || '').trim(),
      location: String(row.location || row.locationType || '').trim(),
      count,
      rate,
      effort,
      actualCost: Number((count * rate * effort).toFixed(2)),
    };
  });
  const resourceCost = finalResourceLoading.reduce((sum, row) => sum + row.actualCost, 0);
  const actualEffort = finalResourceLoading.reduce((sum, row) => sum + (row.count * row.effort), 0);
  const actualTeamSize = finalResourceLoading.reduce((sum, row) => sum + row.count, 0);
  const directActualEffort = payload.actualEffortPd ?? payload.actual_effort_pd ?? actuals.actualEffortPd ?? actuals.actual_effort_pd;
  const directActualBudget = payload.actualBudget ?? payload.actual_budget ?? actuals.actualBudget ?? actuals.actual_budget;
  const directActualTeamSize = payload.actualTeamSize ?? payload.actual_team_size ?? actuals.actualTeamSize ?? actuals.actual_team_size;
  const actualCompletionPercent = requireNonNegativeNumber(
    payload.actualCompletionPercent ?? payload.actual_completion_percent ?? actuals.actualCompletionPercent ?? actuals.actual_completion_percent,
    'Actual completion %',
  );
  const managementCost = requireNonNegativeNumber(
    actuals.managementCost ?? actuals.management_cost,
    'Management cost spent',
  );
  const contingencyCost = requireNonNegativeNumber(
    actuals.contingencyCost ?? actuals.contingency_cost,
    'Contingency cost spent',
  );
  const actualCrVolatility = groundMetrics.actualCrVolatility ?? groundMetrics.actual_cr_volatility ?? '';
  const riskLevelIndicators = groundMetrics.riskLevelIndicators ?? groundMetrics.risk_level_indicators ?? '';

  return {
    finalResourceLoading,
    managementCost: Number(managementCost.toFixed(2)),
    contingencyCost: Number(contingencyCost.toFixed(2)),
    resourceCost: Number(resourceCost.toFixed(2)),
    fullProjectCost: Number((directActualBudget !== undefined && directActualBudget !== ''
      ? requireNonNegativeNumber(directActualBudget, 'Actual budget')
      : resourceCost + managementCost + contingencyCost).toFixed(2)),
    actualEffort: Number((directActualEffort !== undefined && directActualEffort !== ''
      ? requireNonNegativeNumber(directActualEffort, 'Actual effort')
      : actualEffort).toFixed(2)),
    actualTeamSize: Number((directActualTeamSize !== undefined && directActualTeamSize !== ''
      ? requireNonNegativeNumber(directActualTeamSize, 'Actual team size')
      : actualTeamSize).toFixed(2)),
    actualCompletionPercent: Number(actualCompletionPercent.toFixed(2)),
    actualCompletionDate: toDateOnly(payload.actualCompletionDate ?? payload.actual_completion_date ?? actuals.actualCompletionDate ?? actuals.actual_completion_date),
    actualFinalEstimatedValue: normalizeNumber(
      payload.actualFinalEstimatedValue
        ?? payload.actual_final_estimated_value
        ?? actuals.actualFinalEstimatedValue
        ?? actuals.actual_final_estimated_value,
      null,
    ),
    dependencyCount: normalizeNumber(groundMetrics.dependencyCount ?? groundMetrics.dependency_count, null),
    requirementStabilityIndex: normalizeNumber(
      groundMetrics.requirementStabilityIndex ?? groundMetrics.requirement_stability_index,
      null,
    ),
    actualCrVolatility: String(actualCrVolatility || '').trim() || null,
    riskLevelIndicators: Array.isArray(riskLevelIndicators)
      ? riskLevelIndicators
      : String(riskLevelIndicators || '').split(',').map((item) => item.trim()).filter(Boolean),
  };
}

function validateCompletionPayload(completion) {
  completion.finalResourceLoading.forEach((row, index) => {
    if (!row.role) {
      const error = new Error(`Final resource row ${index + 1} role is required`);
      error.status = 400;
      throw error;
    }
    if (!row.location) {
      const error = new Error(`Final resource row ${index + 1} location is required`);
      error.status = 400;
      throw error;
    }
    if (row.count <= 0 || row.rate < 0 || row.effort <= 0) {
      const error = new Error(`Final resource row ${index + 1} must have positive count and effort, and non-negative rate`);
      error.status = 400;
      throw error;
    }
  });
}

function assertProjectOwner(project, user) {
  if (
    Number(project.ownerId) !== Number(user.userId)
    && Number(project.submittedByUserId) !== Number(user.userId)
  ) {
    const error = new Error('Access forbidden for this project');
    error.status = 403;
    throw error;
  }
}

function assertApprovedProject(project) {
  if (String(project?.workflowStatus || project?.status || '').toUpperCase() !== 'APPROVED') {
    const error = new Error('Only approved active projects support this action');
    error.status = 400;
    throw error;
  }
}

function buildProgressContext(project, snapshots = [], selectedSnapshot = null) {
  const delivery = project?.draftData?.deliveryDetails || {};
  const current = project?.baselineTracking?.current || {};
  const estimation = project?.baselineTracking?.estimation || {};
  const approvedScheduleImpactDays = normalizeNumber(project?.totalCrScheduleImpactDays, 0);
  const plannedDuration = getCalendarDays(project.startDate, project.plannedEndDate)
    + approvedScheduleImpactDays;
  const effectiveEndDate = addCalendarDays(project.plannedEndDate, approvedScheduleImpactDays);
  return {
    project: {
      projectId: project.projectId,
      projectCode: project.projectCode,
      projectName: project.name,
      workflowStatus: project.workflowStatus,
    },
    currentApprovedValues: {
      plannedEffortPd: current.effort,
      plannedBudget: current.budget,
      plannedTeamSize: current.teamSize,
      plannedDuration,
      startDate: project.startDate,
      plannedEndDate: project.plannedEndDate,
      effectiveEndDate,
      approvedScheduleImpactDays,
      currentEstimation: estimation.actualFinalEstimatedValue ?? estimation.pmEstimatedValue,
    },
    latestSnapshot: snapshots[0] || null,
    selectedSnapshot,
    snapshots,
  };
}

async function getProjectProgress(projectId, user, snapshotDate = '') {
  assertPmUser(user);
  const project = await projectRepository.getProjectById(projectId, user.organizationId);
  if (!project) {
    const error = new Error('Project not found');
    error.status = 404;
    throw error;
  }
  assertProjectOwner(project, user);
  assertApprovedProject(project);
  const snapshots = await projectRepository.findProgressSnapshots(projectId);
  const selectedSnapshot = snapshotDate
    ? await projectRepository.getProgressSnapshotByDate(projectId, snapshotDate)
    : null;
  return buildProgressContext(project, snapshots, selectedSnapshot);
}

async function saveProjectProgress(projectId, user, payload) {
  assertPmUser(user);
  const project = await projectRepository.getProjectById(projectId, user.organizationId);
  if (!project) {
    const error = new Error('Project not found');
    error.status = 404;
    throw error;
  }
  assertProjectOwner(project, user);
  assertApprovedProject(project);

  const snapshotDate = toDateOnly(payload.snapshotDate ?? payload.snapshot_date);
  if (!snapshotDate) {
    const error = new Error('Snapshot date is required');
    error.status = 400;
    throw error;
  }
  const actualCompletionPercent = requireNonNegativeNumber(
    payload.actualCompletionPercent ?? payload.actual_completion_percent,
    'Actual completion %',
    { required: true },
  );
  if (actualCompletionPercent > 100) {
    const error = new Error('Actual completion % cannot exceed 100');
    error.status = 400;
    throw error;
  }

  const snapshot = await projectRepository.upsertProgressSnapshot(projectId, user.userId, {
    snapshotDate,
    actualEffortPd: requireNonNegativeNumber(payload.actualEffortPd ?? payload.actual_effort_pd, 'Actual effort (PD)', { required: true }),
    actualBudget: requireNonNegativeNumber(payload.actualBudget ?? payload.actual_budget, 'Actual budget', { required: true }),
    actualTeamSize: requireNonNegativeNumber(payload.actualTeamSize ?? payload.actual_team_size, 'Actual team size', { required: true }),
    actualCompletionPercent,
    remarks: String(payload.remarks || '').trim(),
  });
  try {
    await forecastService.recordProjectForecastSnapshotForDate(projectId, snapshotDate);
  } catch (error) {
    console.warn('Forecast snapshot generation after progress save failed:', error.message);
  }
  const snapshots = await projectRepository.findProgressSnapshots(projectId);
  return buildProgressContext(project, snapshots, snapshot);
}

async function completeProject(projectId, user, payload) {
  assertPmUser(user);

  const completion = normalizeCompletionPayload(payload);
  validateCompletionPayload(completion);
  const comment = String(payload.comment || 'Project completed').trim() || 'Project completed';

  const connection = await pool.promise().getConnection();
  try {
    await connection.beginTransaction();
    const project = await projectRepository.getProjectForCompletion(connection, projectId);
    if (!project || Number(project.organizationId) !== Number(user.organizationId)) {
      const error = new Error('Project not found');
      error.status = 404;
      throw error;
    }

    if (
      Number(project.ownerId) !== Number(user.userId)
      && Number(project.submittedByUserId) !== Number(user.userId)
    ) {
      const error = new Error('Access forbidden for this project');
      error.status = 403;
      throw error;
    }

    if (String(project.workflowStatus || '').toUpperCase() !== 'APPROVED') {
      const error = new Error('Only approved projects can be completed');
      error.status = 400;
      throw error;
    }

    if (completion.actualFinalEstimatedValue === null) {
      completion.actualFinalEstimatedValue = normalizeNumber(project.actualFinalEstimatedValue, 0);
    }
    if (!completion.actualCompletionDate) {
      completion.actualCompletionDate = toDateOnly(new Date());
    }

    const completionRecord = await projectRepository.insertProjectCompletion(connection, {
      projectId,
      organizationId: user.organizationId,
      completedByUserId: user.userId,
      payload,
      ...completion,
    });
    // console.info('Storing project completion actuals', {
    //   projectId,
    //   actualEffort: completion.actualEffort,
    //   actualBudget: completion.fullProjectCost,
    //   actualTeamSize: completion.actualTeamSize,
    //   actualFinalEstimatedValue: completion.actualFinalEstimatedValue,
    // });
    const actualsUpdated = await projectRepository.updateProjectActuals(connection, projectId, {
      actualEffort: completion.actualEffort,
      actualBudget: completion.fullProjectCost,
      actualTeamSize: completion.actualTeamSize,
      actualFinalEstimatedValue: completion.actualFinalEstimatedValue,
      actualCompletionDate: completion.actualCompletionDate,
    });
    if (!actualsUpdated) {
      const error = new Error('Project completion actuals could not be stored');
      error.status = 409;
      throw error;
    }
    const marked = await projectRepository.markProjectComplete(
      connection,
      projectId,
      user,
      comment,
    );
    if (!marked) {
      const error = new Error('Project is no longer available for completion');
      error.status = 409;
      throw error;
    }

    await connection.commit();

    // Notification
    await notificationService.notifyProjectUpdate(project, 'PROJECT_COMPLETED', 'Project Completed', `Project "${project.name}" has been completed.`);

    return {
      ...completionRecord,
      projectId,
      status: 'COMPLETED',
      fullProjectCost: completion.fullProjectCost,
      actualEffort: completion.actualEffort,
      actualTeamSize: completion.actualTeamSize,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getProject(projectId, organizationId) {
  return projectRepository.getProjectById(projectId, organizationId);
}

async function getDraftProject(draftId, organizationId) {
  return projectRepository.getProjectById(draftId, organizationId);
}

async function getWorkflowHistory(projectId) {
  return workflowService.getWorkflowHistory('PROJECT', projectId);
}

async function transitionProject(projectId, user, actionType, comment) {
  const lifecycleProject = await projectRepository.getLifecycleProjectDraftById(projectId, null, user.organizationId);
  if (lifecycleProject) {
    return transitionLifecycleProject(lifecycleProject, user, actionType, comment);
  }

  const error = new Error('Project not found');
  error.status = 404;
  throw error;
}

async function listApprovedProjectsForPm(user, query) {
  return projectRepository.findProjectsForPm({
    userId: user.userId,
    role: user.role,
    page: query.page,
    pageSize: query.pageSize,
    search: String(query.search || '').trim(),
    status: 'APPROVED',
    industry: String(query.industry || '').trim(),
    deliveryModel: String(query.deliveryModel || query.delivery_model || '').trim(),
    createdFrom: String(query.createdFrom || query.created_from || '').trim(),
    createdTo: String(query.createdTo || query.created_to || '').trim(),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
}

async function listProjectsAvailableForCr(user) {
  return projectRepository.findApprovedProjectsAvailableForCr(user);
}

module.exports = {
  createDraft,
  updateDraft,
  getDraft,
  listProjects,
  listProjectsForPm,
  listApprovedProjectsForPm,
  listProjectsAvailableForCr,
  getProjectProgress,
  saveProjectProgress,
  getProject,
  getDraftProject,
  getWorkflowHistory,
  createProject,
  submitProject,
  transitionProject,
  completeProject,
};
