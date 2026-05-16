const { pool } = require('../config/db.config');
const projectRepository = require('../repositories/project.repository');
const projectPublishingService = require('./projectPublishing.service');
const workflowService = require('../workflow/workflow.service');
const mlPredictionService = require('./mlPrediction.service');
const masterDataRepository = require('../repositories/masterData.repository');

function normalizeNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getInclusiveDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }
  return Math.floor((end - start) / 86400000) + 1;
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
    const durationDays = getInclusiveDays(row.startDate, row.endDate);
    const plannedEffort = count * (allocationPercent / 100) * durationDays;
    const plannedCost = plannedEffort * ratePerDay;

    return {
      ...row,
      locationType,
      allocationPercent,
      ratePerDay,
      durationDays,
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

function normalizeProjectPayload(payload) {
  if (payload && payload.basicInfo) {
    return payload;
  }

  return {
    basicInfo: {
      project_name: payload.name || 'Legacy Project',
      client_name: payload.business_unit || '',
      industry: '',
      project_type: '',
      delivery_model: '',
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
  const rateCards = await masterDataRepository.listRateCards();
  const normalizedRows = normalizeResourceRows(payload).filter((row) =>
    requireResourceLoading || isCompleteResourceRow(row)
  );
  if (requireResourceLoading && normalizedRows.length === 0) {
    const error = new Error('At least one resource loading row is required before submission');
    error.status = 400;
    throw error;
  }
  const normalizedPayload = {
    ...payload,
    teamComposition: {
      ...(payload.teamComposition || {}),
      rows: normalizedRows,
    },
    financial: {
      ...(payload.financial || {}),
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
      ...payload.financial,
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

async function predictProjectHours(projectPayload) {
  const response = await mlPredictionService.getProjectRecommendations({
    team_size: projectPayload.team_size,
    complexity: projectPayload.complexity,
    change_count: 0,
    avg_experience: projectPayload.avg_experience,
    technology_score: projectPayload.technology_score,
  }, projectPayload.created_by);

  return response.effort?.predictedHours || 0;
}

async function createDraft(user, draftData) {
  assertPmUser(user);
  return projectRepository.createDraft(user.userId, await applyDerivedPlanning(draftData));
}

async function updateDraft(draftId, user, draftData) {
  assertPmUser(user);
  const draft = await projectRepository.getDraftById(draftId, user.userId);
  const status = String(draft?.workflowStatus || draft?.status || '').toUpperCase();
  if (draft && !['DRAFT', 'RETURNED'].includes(status)) {
    const error = new Error('Only draft or returned projects can be edited');
    error.status = 400;
    throw error;
  }
  return projectRepository.updateDraft(draftId, user.userId, await applyDerivedPlanning(draftData));
}

async function getDraft(ownerId, draftId) {
  return projectRepository.getDraftById(draftId, ownerId);
}

async function listProjects() {
  return projectRepository.findProjects();
}

async function listProjectsForPm(user, query) {
  return projectRepository.findProjectsForPm({
    userId: user.userId,
    role: user.role,
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

async function submitProject(user, projectData, draftId = null, comment = '') {
  assertPmUser(user);
  const payload = await applyDerivedPlanning(normalizeProjectPayload(projectData), { requireResourceLoading: true });
  validateResourceDates(payload);
  const derivedPlanning = deriveResourcePlanning(payload);
  const technologyScore = normalizeNumber(payload.technology.integration_count, 0);
  const avgExperience = calculateAverageExperience(payload.teamComposition.rows);

  const finalPayload = {
    ...payload,
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
    predicted_hours: await predictProjectHours({
      team_size: normalizeNumber(derivedPlanning.estimatedTeamSize, 1),
      complexity: normalizeNumber(payload.technology.complexity, 1),
      avg_experience: normalizeNumber(avgExperience, 0),
      technology_score: technologyScore,
      created_by: ownerId,
    }),
    _legacy: {
      name: payload.basicInfo.project_name || 'Untitled Project',
      business_unit: payload.basicInfo.client_name || 'Unknown Client',
      technology: payload.technology.technology_stack || 'Unknown',
      complexity: normalizeNumber(payload.technology.complexity, 1),
      team_size: normalizeNumber(derivedPlanning.estimatedTeamSize, 1),
      estimated_hours: normalizeNumber(derivedPlanning.plannedEffort, 0),
      avg_experience: normalizeNumber(avgExperience, 0),
      technology_score: technologyScore,
      created_by: ownerId,
    },
  };

  await mlPredictionService.recordPredictionFeedback({
    projectDraftId: draftId || payload.draftId || null,
    projectData: finalPayload,
  });

  let projectId;
  if (draftId) {
    const updated = await projectRepository.updateDraft(draftId, ownerId, finalPayload, 'DRAFT');
    if (!updated) {
      const error = new Error('Draft not found, not owned by user, or already approved');
      error.status = 404;
      throw error;
    }
    projectId = draftId;
  } else {
    const created = await projectRepository.createDraft(ownerId, finalPayload, 'DRAFT');
    projectId = created.draftId;
  }

  await workflowService.transitionWorkflow({
    entityType: 'PROJECT',
    entityId: projectId,
    user: { userId: ownerId, role: 'PM' },
    actionType: 'SUBMIT',
    comment,
  });

  return {
    projectId,
    draftId: projectId,
    ...finalPayload,
  };
}

async function getProject(projectId) {
  const approvedProject = await projectRepository.getProjectById(projectId);
  if (approvedProject) {
    return approvedProject;
  }
  return projectRepository.getDraftProjectById(projectId);
}

async function getDraftProject(draftId) {
  return projectRepository.getDraftProjectById(draftId);
}

async function getWorkflowHistory(projectId) {
  return workflowService.getWorkflowHistory('PROJECT', projectId);
}

async function transitionProject(projectId, user, actionType, comment) {
  if (String(actionType || '').toUpperCase() !== 'APPROVE') {
    return workflowService.transitionWorkflow({
      entityType: 'PROJECT',
      entityId: projectId,
      user,
      actionType,
      comment,
    });
  }

  await projectRepository.ensureDraftTable();
  await projectRepository.ensureApprovedProjectTables();
  await workflowService.ensureWorkflowSchema('PROJECT');

  const connection = await pool.promise().getConnection();
  try {
    await connection.beginTransaction();
    const transition = await workflowService.transitionWorkflowInTransaction(connection, {
      entityType: 'PROJECT',
      entityId: projectId,
      user,
      actionType,
      comment,
    });
    const published = await projectPublishingService.publishApprovedDraft(connection, projectId, user.userId);
    await connection.commit();

    return {
      ...transition,
      publishedProjectId: published.projectId,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  await projectRepository.ensureDraftTable();
  await projectRepository.ensureApprovedProjectTables();

  const accessibleApprovedDrafts = await projectRepository.findProjectsForPm({
    userId: user.userId,
    role: user.role,
    page: 1,
    pageSize: 100,
    status: 'APPROVED',
    sortBy: 'updatedAt',
    sortOrder: 'DESC',
  });

  const unpublishedApprovedDrafts = (accessibleApprovedDrafts.items || []).filter(
    (project) => project.recordType !== 'APPROVED_PROJECT' && !project.publishedProjectId,
  );

  for (const draft of unpublishedApprovedDrafts) {
    const connection = await pool.promise().getConnection();
    try {
      await connection.beginTransaction();
      await projectPublishingService.publishApprovedDraft(connection, draft.draftId || draft.projectId, null);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (error.status !== 409) {
        throw error;
      }
    } finally {
      connection.release();
    }
  }

  return projectRepository.findApprovedProjectsAvailableForCr(user);
}

async function transitionProjectLegacy(projectId, user, actionType, comment) {
  return workflowService.transitionWorkflow({
    entityType: 'PROJECT',
    entityId: projectId,
    user,
    actionType,
    comment,
  });
}

module.exports = {
  createDraft,
  updateDraft,
  getDraft,
  listProjects,
  listProjectsForPm,
  listApprovedProjectsForPm,
  listProjectsAvailableForCr,
  getProject,
  getDraftProject,
  getWorkflowHistory,
  createProject,
  submitProject,
  transitionProject,
};
