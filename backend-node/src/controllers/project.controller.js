const projectService = require('../services/project.service');

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
    return res.status(500).json({ message: 'Failed to update draft' });
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
    const { draftId, projectData } = req.body;

    const data = projectData || req.body;
    const submitted = await projectService.submitProject(ownerId, data, draftId);

    return res.status(201).json({ message: 'Project submitted', projectId: submitted.projectId });
  } catch (error) {
    console.error('Project submission failed:', error);
    return res.status(500).json({ message: 'Failed to submit project' });
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
    const project = await projectService.createProject(ownerId, payload);
    return res.status(201).json({ message: 'Project created with prediction', projectId: project.projectId, predicted_hours: project.predicted_hours });
  } catch (error) {
    console.error('Project creation failed:', error);
    return res.status(500).json({ message: 'Failed to create project' });
  }
}

module.exports = {
  createDraft,
  updateDraft,
  getDraft,
  submitProject,
  listProjects,
  createProject,
};
