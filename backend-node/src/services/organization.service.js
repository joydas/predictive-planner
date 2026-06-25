const organizationRepository = require('../repositories/organization.repository');

const STATUS_VALUES = ['ACTIVE', 'INACTIVE'];

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

function assertSuperAdmin(user) {
  if (normalizeRole(user?.role) !== 'SUPER_ADMIN') {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
}

function normalizeStatus(status) {
  const value = String(status || 'ACTIVE').trim().toUpperCase();
  if (value === 'DISABLED' || value === 'DEACTIVATED') return 'INACTIVE';
  return value;
}

function validateOrganizationPayload(payload) {
  const organizationName = String(payload.organizationName || payload.name || '').trim();
  const organizationCode = String(payload.organizationCode || payload.code || '').trim().toUpperCase();
  const status = normalizeStatus(payload.status);

  if (!organizationName) {
    const error = new Error('Organization name is required');
    error.status = 400;
    throw error;
  }
  if (!organizationCode) {
    const error = new Error('Organization code is required');
    error.status = 400;
    throw error;
  }
  if (!STATUS_VALUES.includes(status)) {
    const error = new Error('Organization status must be ACTIVE or INACTIVE');
    error.status = 400;
    throw error;
  }

  return { organizationName, organizationCode, status };
}

async function listOrganizations(user) {
  assertSuperAdmin(user);
  const items = await organizationRepository.listOrganizations();
  return { items };
}

async function listOrganizationOptions(user) {
  const role = normalizeRole(user?.role);
  if (role === 'SUPER_ADMIN') {
    const items = await organizationRepository.listOrganizationOptions();
    return { items };
  }
  if (role === 'ADMIN') {
    const organization = await organizationRepository.findById(user.organizationId);
    return { items: organization ? [organization] : [] };
  }
  const error = new Error('Access denied');
  error.status = 403;
  throw error;
}

async function createOrganization(user, payload) {
  assertSuperAdmin(user);
  const normalized = validateOrganizationPayload({ ...payload, status: payload.status || 'ACTIVE' });
  const duplicate = await organizationRepository.findByCode(normalized.organizationCode);
  if (duplicate) {
    const error = new Error('Organization code already exists');
    error.status = 409;
    throw error;
  }
  return organizationRepository.createOrganization(normalized);
}

async function updateOrganization(user, organizationId, payload) {
  assertSuperAdmin(user);
  const existing = await organizationRepository.findById(organizationId);
  if (!existing) {
    const error = new Error('Organization not found');
    error.status = 404;
    throw error;
  }
  const normalized = validateOrganizationPayload(payload);
  const duplicate = await organizationRepository.findByCode(normalized.organizationCode, organizationId);
  if (duplicate) {
    const error = new Error('Organization code already exists');
    error.status = 409;
    throw error;
  }
  return organizationRepository.updateOrganization(organizationId, normalized);
}

async function getOrganizationSummary(user, organizationId) {
  const role = normalizeRole(user?.role);
  const targetOrganizationId = Number(organizationId || user?.organizationId);
  if (role !== 'SUPER_ADMIN' && Number(user?.organizationId) !== targetOrganizationId) {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    const error = new Error('Access denied');
    error.status = 403;
    throw error;
  }
  const summary = await organizationRepository.getOrganizationSummary(targetOrganizationId);
  if (!summary) {
    const error = new Error('Organization not found');
    error.status = 404;
    throw error;
  }
  return summary;
}

module.exports = {
  createOrganization,
  getOrganizationSummary,
  listOrganizationOptions,
  listOrganizations,
  normalizeRole,
  updateOrganization,
};
