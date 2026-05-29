const authService = require('./auth.service');
const userRepository = require('../repositories/user.repository');
const axios = require('axios');

const ROLE_VALUES = ['ADMIN', 'AM', 'PM'];
const DEFAULT_ML_API_URL = 'http://127.0.0.1:8000';
const normalizeUrl = (url) => String(url || DEFAULT_ML_API_URL).replace(/\/+$/, '');
const ML_API_URL = normalizeUrl(process.env.ML_API_URL || DEFAULT_ML_API_URL);

function normalizeRole(role) {
  const value = String(role || '').trim().toUpperCase();
  if (value === 'ACCOUNT_MANAGER') return 'AM';
  return value;
}

function assertAdmin(user) {
  if (normalizeRole(user?.role) !== 'ADMIN') {
    const error = new Error('Administration access requires ADMIN role');
    error.status = 403;
    throw error;
  }
}

function validateUserPayload(payload, { requirePassword = false } = {}) {
  const role = normalizeRole(payload.role);
  const userName = String(payload.userName || payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '').trim();
  const activeFlag = payload.activeFlag === undefined ? true : Boolean(payload.activeFlag);
  const managerId = role === 'PM' && payload.managerId ? Number(payload.managerId) : null;

  if (!userName) {
    const error = new Error('User name is required');
    error.status = 400;
    throw error;
  }
  if (!email) {
    const error = new Error('Email is required');
    error.status = 400;
    throw error;
  }
  if (!ROLE_VALUES.includes(role)) {
    const error = new Error('Role must be ADMIN, AM, or PM');
    error.status = 400;
    throw error;
  }
  if (requirePassword && !password) {
    const error = new Error('Password is required');
    error.status = 400;
    throw error;
  }

  return {
    userName,
    email,
    password,
    role,
    managerId,
    activeFlag,
  };
}

async function assertValidManager(managerId) {
  if (!managerId) return;
  const manager = await userRepository.findById(managerId);
  if (!manager || !manager.activeFlag || !['AM', 'ACCOUNT_MANAGER'].includes(String(manager.role || '').toUpperCase())) {
    const error = new Error('Assigned Account Manager must be an active AM user');
    error.status = 400;
    throw error;
  }
}

async function listUsers(user) {
  assertAdmin(user);
  const [users, accountManagers] = await Promise.all([
    userRepository.listUsers(),
    userRepository.listActiveAccountManagers(),
  ]);
  return { items: users, accountManagers };
}

async function createUser(user, payload) {
  assertAdmin(user);
  const normalized = validateUserPayload(payload, { requirePassword: true });
  await assertValidManager(normalized.managerId);
  const passwordHash = await authService.hashPassword(normalized.password);
  return userRepository.createUser({ ...normalized, passwordHash });
}

async function updateUser(user, userId, payload) {
  assertAdmin(user);
  const existing = await userRepository.findById(userId);
  if (!existing) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  const normalized = validateUserPayload(payload);
  await assertValidManager(normalized.managerId);
  const passwordHash = normalized.password ? await authService.hashPassword(normalized.password) : null;
  return userRepository.updateUser(userId, { ...normalized, passwordHash });
}

async function getMlAdministration(user) {
  assertAdmin(user);
  const response = await axios.get(`${ML_API_URL}/admin/ml/status`, { timeout: 10000 });
  return response.data;
}

async function retrainMlModels(user) {
  assertAdmin(user);
  const response = await axios.post(`${ML_API_URL}/admin/ml/retrain`, {}, { timeout: 10000 });
  return response.data;
}

async function getMlTrainingJob(user, jobId) {
  assertAdmin(user);
  const response = await axios.get(`${ML_API_URL}/admin/ml/jobs/${encodeURIComponent(jobId)}`, { timeout: 10000 });
  return response.data;
}

module.exports = {
  createUser,
  getMlAdministration,
  getMlTrainingJob,
  listUsers,
  normalizeRole,
  retrainMlModels,
  updateUser,
};
