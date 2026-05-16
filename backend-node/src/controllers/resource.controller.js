const resourceService = require('../services/resource.service');

async function listResources(req, res) {
  try {
    const filters = {
      role: req.query.role,
      skill: req.query.skill,
      experienceMin: req.query.experienceMin,
      experienceMax: req.query.experienceMax,
      location: req.query.location,
      availableFrom: req.query.availableFrom,
      availableTo: req.query.availableTo,
    };
    const resources = await resourceService.listResources(filters);
    return res.json({ items: resources });
  } catch (error) {
    console.error('Resource list failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load resources' });
  }
}

async function getAvailability(req, res) {
  try {
    const filters = {
      role: req.query.role,
      skill: req.query.skill,
      location: req.query.location,
      experienceMin: req.query.experienceMin,
      experienceMax: req.query.experienceMax,
      availableFrom: req.query.availableFrom,
      availableTo: req.query.availableTo,
    };
    const availability = await resourceService.getResourceAvailability(filters);
    return res.json(availability);
  } catch (error) {
    console.error('Resource availability failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load availability' });
  }
}

async function getUtilization(req, res) {
  try {
    const filters = {
      role: req.query.role,
      skill: req.query.skill,
      location: req.query.location,
      experienceMin: req.query.experienceMin,
      experienceMax: req.query.experienceMax,
    };
    const utilization = await resourceService.getResourceUtilization(filters);
    return res.json(utilization);
  } catch (error) {
    console.error('Resource utilization failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load utilization' });
  }
}

async function getBench(req, res) {
  try {
    const filters = {
      role: req.query.role,
      skill: req.query.skill,
      location: req.query.location,
      experienceMin: req.query.experienceMin,
      experienceMax: req.query.experienceMax,
      availableFrom: req.query.availableFrom,
      availableTo: req.query.availableTo,
    };
    const bench = await resourceService.getBenchResources(filters);
    return res.json(bench);
  } catch (error) {
    console.error('Resource bench failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load bench capacity' });
  }
}

async function listAllocations(req, res) {
  try {
    const filters = {
      projectId: req.query.projectId,
      resourceId: req.query.resourceId,
    };
    const allocations = await resourceService.listAllocations(filters);
    return res.json({ items: allocations });
  } catch (error) {
    console.error('Resource allocations retrieval failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load allocations' });
  }
}

async function createAllocation(req, res) {
  try {
    const allocationData = req.body;
    const created = await resourceService.createAllocation(allocationData);
    return res.status(201).json({ message: 'Allocation created', allocationId: created.allocationId });
  } catch (error) {
    console.error('Resource allocation failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to create allocation' });
  }
}

module.exports = {
  listResources,
  getAvailability,
  getUtilization,
  getBench,
  listAllocations,
  createAllocation,
};
