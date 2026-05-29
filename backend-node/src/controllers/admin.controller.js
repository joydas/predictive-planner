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

module.exports = {
  createUser,
  listUsers,
  updateUser,
};
