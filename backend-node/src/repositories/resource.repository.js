const { pool } = require('../config/db.config');
const TenantContext = require('../utils/tenantContext');

const db = pool.promise();

function normalizeResourceRow(row) {
  return {
    resourceId: row.resourceId,
    employeeCode: row.employeeCode,
    employeeName: row.employeeName,
    primaryRoleId: row.primaryRoleId,
    primaryRoleName: row.primaryRoleName,
    locationType: row.locationType,
    yearsExperience: Number(row.yearsExperience || 0),
    employmentType: row.employmentType,
    joiningDate: row.joiningDate,
    activeFlag: Boolean(row.activeFlag),
    skills: (row.skills || '').split(',').filter(Boolean),
    utilizationPercent: Number(row.utilizationPercent || 0),
    availabilityWindowUtilization: Number(row.availabilityWindowUtilization || row.utilizationPercent || 0),
    capacityLeft: Math.max(0, 100 - Number(row.utilizationPercent || 0)),
    availabilityCapacityLeft: Math.max(0, 100 - Number(row.availabilityWindowUtilization || row.utilizationPercent || 0)),
    allocationsCount: Number(row.allocationsCount || 0),
    nextReleaseDate: row.nextReleaseDate || null,
    overAllocated: Number(row.utilizationPercent || 0) > 100,
  };
}

async function listResources(filters = {}) {
  const organizationId = TenantContext.getOrganizationId();
  const params = [];
  const where = ['rm.active_flag = 1', 'rm.organization_id = ?'];
  params.push(organizationId);

  if (filters.role) {
    where.push('r.role_name = ?');
    params.push(filters.role);
  }

  if (filters.location) {
    where.push('rm.location_type = ?');
    params.push(filters.location.toUpperCase());
  }

  if (filters.experienceMin !== undefined && filters.experienceMin !== null) {
    where.push('rm.years_experience >= ?');
    params.push(filters.experienceMin);
  }

  if (filters.experienceMax !== undefined && filters.experienceMax !== null) {
    where.push('rm.years_experience <= ?');
    params.push(filters.experienceMax);
  }

  if (filters.skill) {
    where.push(
      `EXISTS (
        SELECT 1
        FROM resource_skill_map rsmf
        INNER JOIN md_skill sf ON sf.skill_id = rsmf.skill_id
        WHERE rsmf.resource_id = rm.resource_id
          AND sf.skill_name = ?
      )`
    );
    params.push(filters.skill);
  }

  const availableFrom = filters.availableFrom || filters.from || null;
  const availableTo = filters.availableTo || filters.to || null;
  const windowFrom = availableFrom || new Date().toISOString().slice(0, 10);
  const windowTo = availableTo || windowFrom;
  const hasWindow = Boolean(availableFrom || availableTo);

  const query = `
    SELECT
      rm.resource_id AS resourceId,
      rm.employee_code AS employeeCode,
      rm.employee_name AS employeeName,
      rm.location_type AS locationType,
      rm.years_experience AS yearsExperience,
      rm.employment_type AS employmentType,
      rm.joining_date AS joiningDate,
      rm.active_flag AS activeFlag,
      rm.primary_role_id AS primaryRoleId,
      r.role_name AS primaryRoleName,
      COALESCE(GROUP_CONCAT(DISTINCT s.skill_name SEPARATOR ','), '') AS skills,
      COALESCE(SUM(CASE WHEN ra.allocation_status = 'ACTIVE'
                AND ra.organization_id = rm.organization_id
                AND (ra.allocation_end_date IS NULL OR ra.allocation_end_date >= CURDATE())
                AND (ra.allocation_start_date IS NULL OR ra.allocation_start_date <= CURDATE())
                THEN ra.allocation_percent ELSE 0 END), 0) AS utilizationPercent,
      COALESCE(SUM(CASE WHEN ra.allocation_status = 'ACTIVE'
                AND ra.organization_id = rm.organization_id
                AND (ra.allocation_end_date IS NULL OR ra.allocation_end_date >= ?)
                AND (ra.allocation_start_date IS NULL OR ra.allocation_start_date <= ?)
                THEN ra.allocation_percent ELSE 0 END), 0) AS availabilityWindowUtilization,
      COUNT(DISTINCT ra.allocation_id) AS allocationsCount,
      MIN(CASE WHEN ra.allocation_status = 'ACTIVE' AND ra.allocation_end_date >= CURDATE() THEN ra.allocation_end_date END) AS nextReleaseDate
    FROM resource_master rm
    LEFT JOIN md_role r ON r.role_id = rm.primary_role_id
    LEFT JOIN resource_skill_map rsm ON rsm.resource_id = rm.resource_id
    LEFT JOIN md_skill s ON s.skill_id = rsm.skill_id
    LEFT JOIN resource_allocation ra ON ra.resource_id = rm.resource_id AND ra.organization_id = rm.organization_id
    WHERE ${where.join(' AND ')}
    GROUP BY rm.resource_id
    ${hasWindow ? 'HAVING availabilityWindowUtilization < 100' : ''}
    ORDER BY rm.employee_name ASC
  `;

  const [rows] = await db.query(query, [windowTo, windowFrom, ...params]);
  return rows.map(normalizeResourceRow);
}

async function getApprovedProjectDates(projectId) {
  const organizationId = TenantContext.getOrganizationId();
  const [rows] = await db.query(
    `
      SELECT
        JSON_UNQUOTE(JSON_EXTRACT(approved_data, '$.deliveryDetails.start_date')) AS startDate,
        JSON_UNQUOTE(JSON_EXTRACT(approved_data, '$.deliveryDetails.planned_end_date')) AS endDate
      FROM project
      WHERE project_id = ? AND organization_id = ?
      LIMIT 1
    `,
    [projectId, organizationId]
  );
  return rows[0] || null;
}

async function getResourceById(resourceId) {
  const organizationId = TenantContext.getOrganizationId();
  const [rows] = await db.query(
    `
      SELECT resource_id AS resourceId,
             active_flag AS activeFlag
      FROM resource_master
      WHERE resource_id = ? AND organization_id = ?
      LIMIT 1
    `,
    [resourceId, organizationId]
  );
  return rows[0] || null;
}

async function createAllocation(allocation) {
  const organizationId = TenantContext.getOrganizationId();
  const {
    projectId,
    resourceId,
    roleId,
    allocationPercent,
    allocationStartDate,
    allocationEndDate,
    allocationStatus,
  } = allocation;

  if (!projectId || !resourceId || !roleId) {
    const error = new Error('projectId, resourceId, and roleId are required');
    error.status = 400;
    throw error;
  }

  const percent = Number(allocationPercent);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    const error = new Error('allocationPercent must be a positive number no greater than 100');
    error.status = 400;
    throw error;
  }

  const resource = await getResourceById(resourceId);
  if (!resource || resource.activeFlag !== 1) {
    const error = new Error('Resource not found or inactive');
    error.status = 404;
    throw error;
  }

  const projectDates = await getApprovedProjectDates(projectId);
  if (!projectDates) {
    const error = new Error('Approved project not found for allocation');
    error.status = 404;
    throw error;
  }

  const startDate = allocationStartDate || projectDates.startDate;
  const endDate = allocationEndDate || projectDates.endDate;

  if (!startDate || !endDate) {
    const error = new Error('Allocation start and end dates are required');
    error.status = 400;
    throw error;
  }

  if (endDate < startDate) {
    const error = new Error('allocation_end_date cannot be before allocation_start_date');
    error.status = 400;
    throw error;
  }

  if (projectDates.startDate && startDate < projectDates.startDate) {
    const error = new Error('Allocation start date must be within approved project dates');
    error.status = 400;
    throw error;
  }

  if (projectDates.endDate && endDate > projectDates.endDate) {
    const error = new Error('Allocation end date must be within approved project dates');
    error.status = 400;
    throw error;
  }

  const [result] = await db.query(
    `
      INSERT INTO resource_allocation
        (project_id, resource_id, role_id, allocation_percent, allocation_start_date, allocation_end_date, allocation_status, organization_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      projectId,
      resourceId,
      roleId,
      percent,
      startDate,
      endDate,
      allocationStatus || 'ACTIVE',
      organizationId,
    ]
  );

  return { allocationId: result.insertId };
}

async function listAllocations(filters = {}) {
  const organizationId = TenantContext.getOrganizationId();
  const params = [organizationId];
  const where = ['ra.allocation_status IN (\'ACTIVE\', \'PENDING\', \'PLANNED\')', 'ra.organization_id = ?'];

  if (filters.projectId) {
    where.push('ra.project_id = ?');
    params.push(filters.projectId);
  }

  if (filters.resourceId) {
    where.push('ra.resource_id = ?');
    params.push(filters.resourceId);
  }

  const query = `
    SELECT
      ra.allocation_id AS allocationId,
      ra.project_id AS projectId,
      COALESCE(p.project_name, CONCAT('PRJ-', LPAD(ra.project_id, 6, '0'))) AS projectName,
      ra.resource_id AS resourceId,
      rm.employee_name AS employeeName,
      ra.role_id AS roleId,
      r.role_name AS roleName,
      ra.allocation_percent AS allocationPercent,
      ra.allocation_start_date AS allocationStartDate,
      ra.allocation_end_date AS allocationEndDate,
      ra.allocation_status AS allocationStatus,
      ra.created_at AS createdAt
    FROM resource_allocation ra
    LEFT JOIN project p ON p.project_id = ra.project_id AND p.organization_id = ra.organization_id
    LEFT JOIN resource_master rm ON rm.resource_id = ra.resource_id AND rm.organization_id = ra.organization_id
    LEFT JOIN md_role r ON r.role_id = ra.role_id
    WHERE ${where.join(' AND ')}
    ORDER BY ra.allocation_start_date ASC, ra.allocation_end_date ASC
  `;

  const [rows] = await db.query(query, params);
  return rows.map((row) => ({
    ...row,
    allocationPercent: Number(row.allocationPercent || 0),
    allocationStartDate: row.allocationStartDate,
    allocationEndDate: row.allocationEndDate,
  }));
}

module.exports = {
  listResources,
  createAllocation,
  listAllocations,
};
