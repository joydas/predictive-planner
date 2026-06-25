const userAdminService = require('../services/userAdmin.service');

async function listUsers(req, res) {
  try {
    const result = await userAdminService.listUsers(req.user, req.query || {});
    return res.json(result);
  } catch (error) {
    console.error('User administration list failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load users' });
  }
}

async function createUser(req, res) {
  try {
    const user = await userAdminService.createUser(req.user, req.body || {});
    return res.status(201).json({ message: 'User created', user });
  } catch (error) {
    console.error('User administration creation failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to create user' });
  }
}

async function updateUser(req, res) {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'User id is required' });
    const user = await userAdminService.updateUser(req.user, userId, req.body || {});
    return res.json({ message: 'User updated', user });
  } catch (error) {
    console.error('User administration update failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to update user' });
  }
}

async function resetPassword(req, res) {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ message: 'User id is required' });
    const result = await userAdminService.resetPassword(req.user, userId, req.body || {});
    return res.json({ message: 'Temporary password generated', ...result });
  } catch (error) {
    console.error('User administration password reset failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to reset password' });
  }
}

module.exports = {
  createUser,
  listUsers,
  resetPassword,
  updateUser,
};
