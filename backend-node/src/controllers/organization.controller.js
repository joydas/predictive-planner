const organizationService = require('../services/organization.service');

async function listOrganizations(req, res) {
  try {
    const result = await organizationService.listOrganizations(req.user);
    return res.json(result);
  } catch (error) {
    console.error('Organization list failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load organizations' });
  }
}

async function listOrganizationOptions(req, res) {
  try {
    const result = await organizationService.listOrganizationOptions(req.user);
    return res.json(result);
  } catch (error) {
    console.error('Organization options failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load organizations' });
  }
}

async function createOrganization(req, res) {
  try {
    const organization = await organizationService.createOrganization(req.user, req.body || {});
    return res.status(201).json({ message: 'Organization created', organization });
  } catch (error) {
    console.error('Organization creation failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to create organization' });
  }
}

async function updateOrganization(req, res) {
  try {
    const organizationId = Number(req.params.organizationId);
    if (!organizationId) return res.status(400).json({ message: 'Organization id is required' });
    const organization = await organizationService.updateOrganization(req.user, organizationId, req.body || {});
    return res.json({ message: 'Organization updated', organization });
  } catch (error) {
    console.error('Organization update failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to update organization' });
  }
}

async function getOrganizationSummary(req, res) {
  try {
    const organizationId = Number(req.params.organizationId || req.query.organizationId);
    const summary = await organizationService.getOrganizationSummary(req.user, organizationId);
    return res.json({ summary });
  } catch (error) {
    console.error('Organization summary failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load organization summary' });
  }
}

module.exports = {
  createOrganization,
  getOrganizationSummary,
  listOrganizationOptions,
  listOrganizations,
  updateOrganization,
};
