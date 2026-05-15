const projectService = require('../services/project.service');
const mlPredictionService = require('../services/mlPrediction.service');

async function createDraft(req, res) {
  try {
    const ownerId = req.user.userId;
    const draftData = req.body;
    const draft = await projectService.createDraft(ownerId, draftData);
    return res.status(201).json({ message: 'Draft created', draftId: draft.draftId });
  } catch (error) {
    console.error('Draft creation failed:', error);
    return res.status(500).json({ message: 'Failed to create draft' });
  }
}

async function updateDraft(req, res) {
  try {
    const ownerId = req.user.userId;
    const draftId = Number(req.params.id);
    const draftData = req.body;

    if (!draftId) {
      return res.status(400).json({ message: 'Draft id is required' });
    }

    const updated = await projectService.updateDraft(draftId, ownerId, draftData);
    if (!updated) {
      return res.status(404).json({ message: 'Draft not found or not owned by user' });
    }

    return res.json({ message: 'Draft updated' });
  } catch (error) {
    console.error('Draft update failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to update draft' });
  }
}

async function getDraft(req, res) {
  try {
    const ownerId = req.user.userId;
    const draftId = Number(req.params.id);

    if (!draftId) {
      return res.status(400).json({ message: 'Draft id is required' });
    }

    const draft = await projectService.getDraft(ownerId, draftId);
    if (!draft) {
      return res.status(404).json({ message: 'Draft not found' });
    }

    return res.json({ draft });
  } catch (error) {
    console.error('Draft retrieval failed:', error);
    return res.status(500).json({ message: 'Failed to load draft' });
  }
}

async function submitProject(req, res) {
  try {
    const ownerId = req.user.userId;
    const { draftId, projectData, comment } = req.body;

    const data = projectData || req.body;
    const submitted = await projectService.submitProject(ownerId, data, draftId, comment);

    return res.status(201).json({ message: 'Project submitted', projectId: submitted.projectId });
  } catch (error) {
    console.error('Project submission failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to submit project' });
  }
}

async function listProjects(req, res) {
  try {
    const projects = await projectService.listProjects();
    return res.json(projects);
  } catch (error) {
    console.error('Project list failed:', error);
    return res.status(500).json({ message: 'Failed to retrieve projects' });
  }
}

async function createProject(req, res) {
  try {
    const ownerId = req.user.userId;
    const payload = req.body;
    const project = await projectService.submitProject(ownerId, payload.projectData || payload, null, payload.comment);
    return res.status(201).json({ message: 'Project created with prediction', projectId: project.projectId, predicted_hours: project.predicted_hours });
  } catch (error) {
    console.error('Project creation failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to create project' });
  }
}

async function listMyProjects(req, res) {
  try {
    const projects = await projectService.listProjectsForPm(req.user, req.query || {});
    return res.json(projects);
  } catch (error) {
    console.error('PM project list failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to retrieve projects' });
  }
}

async function listProjectsAvailableForCr(req, res) {
  try {
    const projects = await projectService.listProjectsAvailableForCr(req.user);
    return res.json({ items: projects });
  } catch (error) {
    console.error('CR project availability list failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to retrieve available projects' });
  }
}

async function getProject(req, res) {
  try {
    const projectId = Number(req.params.id);
    if (!projectId) {
      return res.status(400).json({ message: 'Project id is required' });
    }

    const project = await projectService.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const role = String(req.user.role || '').toUpperCase();
    const status = String(project.workflowStatus || project.status || '').toUpperCase();
    const isPmOwner = role === 'PM' && (
      Number(project.ownerId) === Number(req.user.userId)
      || Number(project.submittedByUserId) === Number(req.user.userId)
    );
    const isAccountManagerReviewer = role === 'ACCOUNT_MANAGER'
      && (status === 'SUBMITTED' || Number(project.approvedByUserId) === Number(req.user.userId));

    if (!isPmOwner && !isAccountManagerReviewer) {
      return res.status(403).json({ message: 'Access forbidden for this project' });
    }

    const workflowHistory = await projectService.getWorkflowHistory(project.sourceDraftId || projectId);
    return res.json({ project, workflowHistory });
  } catch (error) {
    console.error('Project retrieval failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load project' });
  }
}

async function getWorkflowHistory(req, res) {
  try {
    const projectId = Number(req.params.id);
    if (!projectId) {
      return res.status(400).json({ message: 'Project id is required' });
    }

    const workflowHistory = await projectService.getWorkflowHistory(projectId);
    return res.json({ workflowHistory });
  } catch (error) {
    console.error('Project workflow history retrieval failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load workflow history' });
  }
}

async function getMlRecommendation(req, res) {
  try {
    const recommendation = await mlPredictionService.getProjectRecommendations(
      req.body.projectData || req.body,
      req.user.userId,
    );
    return res.json(recommendation);
  } catch (error) {
    console.error('ML recommendation failed:', error.response?.data || error.message || error);
    return res.status(error.response?.status || 500).json({
      message: error.response?.data?.detail || 'Unable to generate ML recommendation',
    });
  }
}

function projectTransition(actionType) {
  return async (req, res) => {
    try {
      const projectId = Number(req.params.id);
      if (!projectId) {
        return res.status(400).json({ message: 'Project id is required' });
      }

      const transition = await projectService.transitionProject(projectId, req.user, actionType, req.body.comment);
      const workflowHistory = await projectService.getWorkflowHistory(projectId);
      return res.json({ message: `Project ${transition.toStatus.toLowerCase()}`, transition, workflowHistory });
    } catch (error) {
      console.error(`Project ${actionType} failed:`, error);
      return res.status(error.status || 500).json({ message: error.message || 'Project workflow transition failed' });
    }
  };
}

module.exports = {
  createDraft,
  updateDraft,
  getDraft,
  submitProject,
  listProjects,
  listMyProjects,
  listProjectsAvailableForCr,
  createProject,
  getProject,
  getWorkflowHistory,
  getMlRecommendation,
  submitExistingProject: projectTransition('SUBMIT'),
  approveProject: projectTransition('APPROVE'),
  returnProject: projectTransition('RETURN'),
  rejectProject: projectTransition('REJECT'),
};
