const axios = require('axios');
const projectRepository = require('../repositories/project.repository');

const ML_API_URL = process.env.ML_API_URL || 'http://127.0.0.1:8000';

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const response = await axios.post(`${ML_API_URL}/predict`, {
    team_size: projectPayload.team_size,
    complexity: projectPayload.complexity,
    change_count: 0,
    avg_experience: projectPayload.avg_experience,
    technology_score: projectPayload.technology_score,
  });

  return response.data.predicted_hours || 0;
}

async function createDraft(ownerId, draftData) {
  return projectRepository.createDraft(ownerId, draftData);
}

async function updateDraft(draftId, ownerId, draftData) {
  return projectRepository.updateDraft(draftId, ownerId, draftData);
}

async function getDraft(ownerId, draftId) {
  return projectRepository.getDraftById(draftId, ownerId);
}

async function listProjects() {
  return projectRepository.findProjects();
}

async function createProject(ownerId, projectPayload) {
  return submitProject(ownerId, projectPayload, null);
}

async function submitProject(ownerId, projectData, draftId = null) {
  const payload = normalizeProjectPayload(projectData);
  const technologyScore = normalizeNumber(payload.technology.integration_count, 0);
  const avgExperience = calculateAverageExperience(payload.teamComposition.rows);

  const finalPayload = {
    ...payload,
    predicted_hours: await predictProjectHours({
      team_size: normalizeNumber(payload.financial.estimated_team_size, 1),
      complexity: normalizeNumber(payload.technology.complexity, 1),
      avg_experience: normalizeNumber(avgExperience, 0),
      technology_score: technologyScore,
    }),
    _legacy: {
      name: payload.basicInfo.project_name || 'Untitled Project',
      business_unit: payload.basicInfo.client_name || 'Unknown Client',
      technology: payload.technology.technology_stack || 'Unknown',
      complexity: normalizeNumber(payload.technology.complexity, 1),
      team_size: normalizeNumber(payload.financial.estimated_team_size, 1),
      estimated_hours: normalizeNumber(payload.financial.planned_effort, 0),
      avg_experience: normalizeNumber(avgExperience, 0),
      technology_score: technologyScore,
      created_by: ownerId,
    },
  };

  let projectId;
  if (draftId) {
    await projectRepository.updateDraft(draftId, ownerId, finalPayload, 'SUBMITTED');
    projectId = draftId;
  } else {
    const created = await projectRepository.createDraft(ownerId, finalPayload, 'SUBMITTED');
    projectId = created.draftId;
  }

  return {
    projectId,
    draftId: projectId,
    ...finalPayload,
  };
}

module.exports = {
  createDraft,
  updateDraft,
  getDraft,
  listProjects,
  createProject,
  submitProject,
};
