const adminService = require('../services/admin.service');

async function listUsers(req, res) {
  try {
    const result = await adminService.listUsers(req.user);
    return res.json(result);
  } catch (error) {
    console.error('Admin user list failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load users' });
  }
}

async function createUser(req, res) {
  try {
    const user = await adminService.createUser(req.user, req.body || {});
    return res.status(201).json({ message: 'User created', user });
  } catch (error) {
    console.error('Admin user creation failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to create user' });
  }
}

async function updateUser(req, res) {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'User id is required' });
    const user = await adminService.updateUser(req.user, userId, req.body || {});
    return res.json({ message: 'User updated', user });
  } catch (error) {
    console.error('Admin user update failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to update user' });
  }
}

async function getMlAdministration(req, res) {
  try {
    const result = await adminService.getMlAdministration(req.user);
    return res.json(result);
  } catch (error) {
    console.error('ML administration status failed:', error);
    return res.status(error.status || error.response?.status || 500).json({
      message: error.response?.data?.detail || error.message || 'Failed to load ML administration status',
    });
  }
}

async function retrainMlModels(req, res) {
  try {
    const result = await adminService.retrainMlModels(req.user);
    return res.status(result.accepted === false ? 409 : 202).json(result);
  } catch (error) {
    console.error('ML retraining request failed:', error);
    return res.status(error.status || error.response?.status || 500).json({
      message: error.response?.data?.detail || error.message || 'Failed to start ML retraining',
    });
  }
}

async function getMlTrainingJob(req, res) {
  try {
    const result = await adminService.getMlTrainingJob(req.user, req.params.jobId);
    return res.json(result);
  } catch (error) {
    console.error('ML training job status failed:', error);
    return res.status(error.status || error.response?.status || 500).json({
      message: error.response?.data?.detail || error.message || 'Failed to load ML training job',
    });
  }
}

async function listDataManagementProjects(req, res) {
  try {
    const result = await adminService.listDataManagementProjects(req.user, req.query || {});
    return res.json(result);
  } catch (error) {
    console.error('Admin data project list failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load data management projects' });
  }
}

async function getProjectDeleteSummary(req, res) {
  try {
    const result = await adminService.getProjectDeleteSummary(req.user, req.query || {});
    return res.json(result);
  } catch (error) {
    console.error('Admin project delete summary failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load project delete summary' });
  }
}

async function deleteProject(req, res) {
  try {
    const result = await adminService.deleteProject(req.user, req.body?.project || req.body || {}, req.body?.confirmation);
    return res.json(result);
  } catch (error) {
    console.error('Admin project delete failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to delete project' });
  }
}

async function bulkDeleteProjects(req, res) {
  try {
    const result = await adminService.bulkDeleteProjects(req.user, req.body?.projects || [], req.body?.confirmation);
    return res.json(result);
  } catch (error) {
    console.error('Admin bulk project delete failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to delete projects' });
  }
}

module.exports = {
  bulkDeleteProjects,
  createUser,
  deleteProject,
  getMlAdministration,
  getMlTrainingJob,
  getProjectDeleteSummary,
  listDataManagementProjects,
  listUsers,
  retrainMlModels,
  updateUser,
};
