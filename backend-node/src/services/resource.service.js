const resourceRepository = require('../repositories/resource.repository');

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function listResources(filters = {}) {
  const normalizedFilters = {
    role: filters.role,
    skill: filters.skill,
    location: filters.location,
    experienceMin: normalizeNumber(filters.experienceMin, null),
    experienceMax: normalizeNumber(filters.experienceMax, null),
    availableFrom: filters.availableFrom,
    availableTo: filters.availableTo,
  };

  const resources = await resourceRepository.listResources(normalizedFilters);
  return resources.map((resource) => ({
    ...resource,
    utilizationLabel: resource.overAllocated
      ? 'RED'
      : resource.utilizationPercent >= 90
      ? 'AMBER'
      : 'GREEN',
  }));
}

async function getResourceAvailability(filters = {}) {
  const resources = await listResources(filters);
  return {
    resources,
    availableCount: resources.filter((item) => item.availabilityCapacityLeft > 0).length,
  };
}

async function getResourceUtilization(filters = {}) {
  const resources = await listResources(filters);
  const totalResources = resources.length;
  const overAllocated = resources.filter((item) => item.overAllocated).length;
  const benchResources = resources.filter((item) => item.capacityLeft > 0);
  const averageUtilization = totalResources === 0
    ? 0
    : Number((resources.reduce((sum, item) => sum + item.utilizationPercent, 0) / totalResources).toFixed(2));

  return {
    summary: {
      totalResources,
      averageUtilization,
      overAllocated,
      benchCount: benchResources.length,
      healthyCount: resources.filter((item) => item.utilizationPercent >= 0 && item.utilizationPercent < 90).length,
    },
    resources,
    overAllocatedResources: resources.filter((item) => item.overAllocated).slice(0, 20),
  };
}

async function getBenchResources(filters = {}) {
  const resources = await listResources(filters);
  const benchItems = resources.map((resource) => ({
    ...resource,
    benchStatus: resource.utilizationPercent === 0 ? 'UNALLOCATED' : 'PARTIALLY_ALLOCATED',
  })).filter((item) => item.capacityLeft > 0);

  return {
    benchCount: benchItems.length,
    benchItems,
    upcomingFreeCapacity: benchItems
      .filter((item) => item.nextReleaseDate)
      .sort((a, b) => new Date(a.nextReleaseDate) - new Date(b.nextReleaseDate)),
  };
}

async function createAllocation(allocationData) {
  return resourceRepository.createAllocation(allocationData);
}

async function listAllocations(filters = {}) {
  return resourceRepository.listAllocations(filters);
}

module.exports = {
  listResources,
  getResourceAvailability,
  getResourceUtilization,
  getBenchResources,
  createAllocation,
  listAllocations,
};
