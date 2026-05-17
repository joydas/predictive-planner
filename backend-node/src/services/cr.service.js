const { pool } = require('../config/db.config');
const crRepository = require('../repositories/cr.repository');
const projectRepository = require('../repositories/project.repository');
const workflowService = require('../workflow/workflow.service');

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCrPayload(payload = {}) {
  const basic = payload.basic || payload.basicInfo || payload;
  const impact = payload.impact || payload.impactAssessment || payload;
  const teamImpact = payload.teamImpact || payload;
  const financial = payload.financial || payload.financialImpact || payload;

  const effortImpact = normalizeNumber(
    impact.effortImpact ?? impact.effort_impact ?? impact.estimatedEffortHours ?? impact.estimated_effort_hours,
  );
  const budgetImpact = normalizeNumber(
    financial.budgetImpact ?? financial.budget_impact ?? payload.budgetImpact ?? payload.budget_impact,
    null,
  );
  const teamSizeImpact = normalizeNumber(
    teamImpact.teamSizeImpact ?? teamImpact.team_size_impact ?? payload.teamSizeImpact ?? payload.team_size_impact,
    null,
  );
  const additionalPmCount = normalizeNumber(teamImpact.additionalPmCount ?? teamImpact.additional_pm_count);
  const additionalDevCount = normalizeNumber(teamImpact.additionalDevCount ?? teamImpact.additional_dev_count);
  const additionalQaCount = normalizeNumber(teamImpact.additionalQaCount ?? teamImpact.additional_qa_count);
  const additionalDevOpsCount = normalizeNumber(teamImpact.additionalDevOpsCount ?? teamImpact.additional_devops_count);
  const additionalArchitectCount = normalizeNumber(teamImpact.additionalArchitectCount ?? teamImpact.additional_architect_count);
  const estimatedCostImpact = normalizeNumber(impact.estimatedCostImpact ?? impact.estimated_cost_impact);
  const additionalBudget = normalizeNumber(financial.additionalBudget ?? financial.additional_budget);
  const additionalLicensingCost = normalizeNumber(financial.additionalLicensingCost ?? financial.additional_licensing_cost);
  const infrastructureCostImpact = normalizeNumber(financial.infrastructureCostImpact ?? financial.infrastructure_cost_impact);

  return {
    projectId: Number(basic.project_id || basic.projectId || payload.project_id || payload.projectId),
    title: String(basic.title || basic.crTitle || '').trim(),
    description: String(basic.description || basic.crDescription || '').trim(),
    category: String(basic.category || '').trim(),
    severity: String(basic.severity || '').trim(),
    priority: String(basic.priority || '').trim(),
    affectedModule: String(basic.affectedModule || basic.affected_module || '').trim(),
    scheduleImpactDays: normalizeNumber(impact.scheduleImpactDays ?? impact.schedule_impact_days),
    estimatedEffortHours: effortImpact,
    estimatedCostImpact,
    effortImpact,
    budgetImpact: budgetImpact === null
      ? estimatedCostImpact + additionalBudget + additionalLicensingCost + infrastructureCostImpact
      : budgetImpact,
    teamSizeImpact: teamSizeImpact === null
      ? additionalPmCount + additionalDevCount + additionalQaCount + additionalDevOpsCount + additionalArchitectCount
      : teamSizeImpact,
    dependencyImpact: String(impact.dependencyImpact || impact.dependency_impact || '').trim(),
    environmentsAffected: String(impact.environmentsAffected || impact.environments_affected || '').trim(),
    additionalPmCount,
    additionalDevCount,
    additionalQaCount,
    additionalDevOpsCount,
    additionalArchitectCount,
    additionalBudget,
    additionalLicensingCost,
    infrastructureCostImpact,
  };
}

function validateDraftPayload(crData) {
  if (!crData.projectId) {
    const error = new Error('Project is required');
    error.status = 400;
    throw error;
  }

  if (!crData.title) {
    const error = new Error('CR title is required');
    error.status = 400;
    throw error;
  }
}

function validateSubmitPayload(crData) {
  validateDraftPayload(crData);
  const required = [
    ['description', 'CR description is required'],
    ['category', 'CR category is required'],
    ['severity', 'Severity is required'],
    ['priority', 'Priority is required'],
    ['affectedModule', 'Affected module is required'],
  ];

  required.forEach(([key, message]) => {
    if (!crData[key]) {
      const error = new Error(message);
      error.status = 400;
      throw error;
    }
  });
}

function canAccessProject(user, project) {
  const role = String(user.role || '').toUpperCase();
  const status = String(project.workflowStatus || project.status || '').toUpperCase();

  if (role === 'PM') {
    return Number(project.ownerId) === Number(user.userId)
      || Number(project.submittedByUserId) === Number(user.userId);
  }

  if (role === 'ACCOUNT_MANAGER') {
    return status === 'SUBMITTED' || Number(project.approvedByUserId) === Number(user.userId);
  }

  return false;
}

function canAccessCr(user, changeRequest) {
  const role = String(user.role || '').toUpperCase();
  const status = String(changeRequest.workflowStatus || changeRequest.status || '').toUpperCase();

  if (role === 'PM') {
    return Number(changeRequest.submittedByUserId) === Number(user.userId);
  }

  if (role === 'ACCOUNT_MANAGER') {
    return status === 'SUBMITTED' || Number(changeRequest.approvedByUserId) === Number(user.userId);
  }

  return false;
}

async function assertProjectIsAvailableForPm(user, projectId) {
  const project = await projectRepository.getProjectById(projectId);
  if (!project) {
    const error = new Error('Project not found');
    error.status = 404;
    throw error;
  }

  if (!canAccessProject(user, project) || String(user.role || '').toUpperCase() !== 'PM') {
    const error = new Error('Access forbidden for this project');
    error.status = 403;
    throw error;
  }

  const status = String(project.workflowStatus || project.status || '').toUpperCase();
  if (status !== 'APPROVED') {
    const error = new Error('Change requests can only be created for approved projects');
    error.status = 400;
    throw error;
  }

  return project;
}

async function createDraft(user, payload) {
  const crData = normalizeCrPayload(payload);
  validateDraftPayload(crData);
  await assertProjectIsAvailableForPm(user, crData.projectId);
  return crRepository.createDraft(crData, user.userId);
}

async function updateDraft(user, crId, payload) {
  const existing = await getChangeRequest(user, crId);
  const status = String(existing.workflowStatus || existing.status || '').toUpperCase();
  if (!['DRAFT', 'RETURNED'].includes(status)) {
    const error = new Error('Only draft or returned change requests can be edited');
    error.status = 400;
    throw error;
  }

  const crData = normalizeCrPayload(payload);
  validateDraftPayload(crData);
  await assertProjectIsAvailableForPm(user, crData.projectId);

  const updated = await crRepository.updateDraft(crId, crData);
  if (!updated) {
    const error = new Error('Change request not found or not editable');
    error.status = 404;
    throw error;
  }
  return { crId };
}

async function submitChangeRequest(user, crId, payload, comment) {
  let crData = normalizeCrPayload(payload);
  if (crId && (!crData.projectId || !crData.title)) {
    const existing = await getChangeRequest(user, crId);
    if (!existing) {
      const error = new Error('Change request not found');
      error.status = 404;
      throw error;
    }
    crData = normalizeCrPayload(existing);
  }
  validateSubmitPayload(crData);

  if (crId) {
    await updateDraft(user, crId, crData);
  } else {
    const created = await createDraft(user, crData);
    crId = created.crId;
  }

  const transition = await workflowService.transitionWorkflow({
    entityType: 'CR',
    entityId: crId,
    user,
    actionType: 'SUBMIT',
    comment,
  });

  return { crId, transition };
}

async function getChangeRequest(user, crId) {
  const changeRequest = await crRepository.getChangeRequestById(crId);
  if (!changeRequest) {
    return null;
  }

  if (!canAccessCr(user, changeRequest)) {
    const error = new Error('Access forbidden for this change request');
    error.status = 403;
    throw error;
  }

  return changeRequest;
}

async function getChangeRequestsByProject(user, projectId) {
  const project = await projectRepository.getProjectById(projectId);
  if (!project) {
    const error = new Error('Project not found');
    error.status = 404;
    throw error;
  }

  if (!canAccessProject(user, project)) {
    const error = new Error('Access forbidden for this project');
    error.status = 403;
    throw error;
  }

  const changeRequests = await crRepository.getChangeRequestsByProject(projectId);
  return changeRequests.filter((changeRequest) => canAccessCr(user, changeRequest));
}

async function listCrsForPm(user, query) {
  return crRepository.findCrsForPm({
    userId: user.userId,
    role: user.role,
    page: query.page,
    pageSize: query.pageSize,
    search: String(query.search || '').trim(),
    status: String(query.status || '').trim().toUpperCase(),
    severity: String(query.severity || '').trim(),
    category: String(query.category || '').trim(),
    createdFrom: String(query.createdFrom || query.created_from || '').trim(),
    createdTo: String(query.createdTo || query.created_to || '').trim(),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
}

async function getWorkflowHistory(crId) {
  return workflowService.getWorkflowHistory('CR', crId);
}

async function transitionChangeRequest(crId, user, actionType, comment) {
  const changeRequest = await getChangeRequest(user, crId);
  if (!changeRequest) {
    const error = new Error('Change request not found');
    error.status = 404;
    throw error;
  }

  if (String(actionType || '').toUpperCase() !== 'APPROVE') {
    return workflowService.transitionWorkflow({
      entityType: 'CR',
      entityId: crId,
      user,
      actionType,
      comment,
    });
  }

  const connection = await pool.promise().getConnection();
  try {
    await connection.beginTransaction();
    const lockedChangeRequest = await crRepository.getChangeRequestForUpdate(connection, crId);
    const transition = await workflowService.transitionWorkflowInTransaction(connection, {
      entityType: 'CR',
      entityId: crId,
      user,
      actionType,
      comment,
    });
    console.info('Accumulating approved CR impact', {
      crId,
      projectId: lockedChangeRequest.projectId,
      effortImpact: lockedChangeRequest.effortImpact,
      budgetImpact: lockedChangeRequest.budgetImpact,
      teamSizeImpact: lockedChangeRequest.teamSizeImpact,
    });
    await crRepository.accumulateApprovedCrImpact(connection, lockedChangeRequest);
    await connection.commit();
    return transition;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createDraft,
  getChangeRequest,
  getChangeRequestsByProject,
  getWorkflowHistory,
  listCrsForPm,
  normalizeCrPayload,
  submitChangeRequest,
  transitionChangeRequest,
  updateDraft,
};
