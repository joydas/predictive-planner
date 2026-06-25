const authService = require('./auth.service');
const organizationService = require('./organization.service');
const organizationRepository = require('../repositories/organization.repository');
const userRepository = require('../repositories/user.repository');

const ROLE_VALUES = ['SUPER_ADMIN', 'ADMIN', 'AM', 'PM'];

function normalizeRole(role) {
  const value = String(role || '').trim().toUpperCase();
  if (value === 'ACCOUNT_MANAGER') return 'AM';
  return value;
}

function assertUserAdmin(user) {
  const role = normalizeRole(user?.role);
  if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
}

function resolveOrganizationId(user, payloadOrganizationId) {
  const role = normalizeRole(user?.role);
  const requestedOrganizationId = Number(payloadOrganizationId || user?.organizationId);
  if (!requestedOrganizationId) {
    const error = new Error('Organization is required');
    error.status = 400;
    throw error;
  }
  if (role !== 'SUPER_ADMIN' && Number(user.organizationId) !== requestedOrganizationId) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
  return requestedOrganizationId;
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let value = 'Tmp-';
  for (let index = 0; index < 10; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

function normalizeActiveFlag(payload) {
  if (payload.activeFlag !== undefined) return Boolean(payload.activeFlag);
  if (payload.status !== undefined) return String(payload.status).toUpperCase() === 'ACTIVE';
  return true;
}

function validateCreatePayload(payload) {
  const userName = String(payload.userName || payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '').trim();
  const role = normalizeRole(payload.role);
  const activeFlag = normalizeActiveFlag(payload);

  if (!userName) {
    const error = new Error('Name is required');
    error.status = 400;
    throw error;
  }
  if (!email) {
    const error = new Error('Email is required');
    error.status = 400;
    throw error;
  }
  if (!password) {
    const error = new Error('Password is required');
    error.status = 400;
    throw error;
  }
  if (!ROLE_VALUES.includes(role)) {
    const error = new Error('Role is invalid');
    error.status = 400;
    throw error;
  }

  return { userName, email, password, role, activeFlag };
}

function validateUpdatePayload(payload) {
  const role = normalizeRole(payload.role);
  const activeFlag = normalizeActiveFlag(payload);
  if (!ROLE_VALUES.includes(role)) {
    const error = new Error('Role is invalid');
    error.status = 400;
    throw error;
  }
  return { role, activeFlag };
}

async function assertOrganizationCanReceiveUser(organizationId) {
  const organization = await organizationRepository.findById(organizationId);
  if (!organization) {
    const error = new Error('Organization not found');
    error.status = 404;
    throw error;
  }
  return organization;
}

async function listUsers(user, query = {}) {
  assertUserAdmin(user);
  const organizationId = normalizeRole(user.role) === 'SUPER_ADMIN'
    ? (query.organizationId ? Number(query.organizationId) : null)
    : resolveOrganizationId(user, user.organizationId);
  const [items, organizations] = await Promise.all([
    userRepository.listUsers(organizationId),
    organizationService.listOrganizationOptions(user).then((result) => result.items),
  ]);
  const isSuperAdmin = normalizeRole(user.role) === 'SUPER_ADMIN';
  const filteredItems = isSuperAdmin ? items : items.filter(u => normalizeRole(u.role) !== 'SUPER_ADMIN');
  return { items: filteredItems, organizations };
}

async function createUser(user, payload) {
  assertUserAdmin(user);
  const normalized = validateCreatePayload(payload);
  if (normalizeRole(user.role) !== 'SUPER_ADMIN' && normalized.role === 'SUPER_ADMIN') {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
  let organizationId = null;
  if (normalized.role !== 'SUPER_ADMIN') {
    organizationId = resolveOrganizationId(user, payload.organizationId);
    await assertOrganizationCanReceiveUser(organizationId);
  }
  const passwordHash = await authService.hashPassword(normalized.password);
  return userRepository.createUser({
    ...normalized,
    organizationId,
    passwordHash,
    managerId: null,
  });
}

async function updateUser(user, userId, payload) {
  assertUserAdmin(user);
  const normalized = validateUpdatePayload(payload);
  const existingOrgId = payload.organizationId ? Number(payload.organizationId) : null;
  let existing = await userRepository.findById(userId, existingOrgId);
  if (!existing && existingOrgId !== null) {
    existing = await userRepository.findById(userId, null);
  }
  if (!existing) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  if (normalizeRole(user.role) !== 'SUPER_ADMIN' && (normalized.role === 'SUPER_ADMIN' || normalizeRole(existing.role) === 'SUPER_ADMIN')) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
  let targetOrgId = null;
  if (normalized.role !== 'SUPER_ADMIN') {
    targetOrgId = resolveOrganizationId(user, payload.organizationId);
  }
  return userRepository.updateUserAdminFields(userId, existing.organizationId, { ...normalized, organizationId: targetOrgId });
}

async function resetPassword(user, userId, payload) {
  assertUserAdmin(user);
  const organizationId = resolveOrganizationId(user, payload.organizationId);
  const existing = await userRepository.findById(userId, organizationId);
  if (!existing) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }
  if (normalizeRole(user.role) !== 'SUPER_ADMIN' && normalizeRole(existing.role) === 'SUPER_ADMIN') {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await authService.hashPassword(temporaryPassword);
  await userRepository.updatePassword(userId, organizationId, passwordHash);
  return { temporaryPassword };
}

module.exports = {
  createUser,
  listUsers,
  resetPassword,
  updateUser,
};
