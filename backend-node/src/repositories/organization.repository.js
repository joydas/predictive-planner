const { pool } = require('../config/db.config');

async function query(sql, params = []) {
  const [rows] = await pool.promise().query(sql, params);
  return rows;
}

function mapOrganization(row) {
  return {
    organizationId: row.organizationId,
    id: row.organizationId,
    organizationName: row.organizationName,
    organizationCode: row.organizationCode,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    userCount: Number(row.userCount || 0),
    projectCount: Number(row.projectCount || 0),
  };
}

function mapOrganizationSummary(row) {
  return {
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    organizationCode: row.organizationCode,
    status: row.status,
    totalUsers: Number(row.totalUsers || 0),
    totalProjects: Number(row.totalProjects || 0),
    activeProjects: Number(row.activeProjects || 0),
    completedProjects: Number(row.completedProjects || 0),
    totalCrs: Number(row.totalCrs || 0),
    lastActivityDate: row.lastActivityDate,
  };
}

async function listOrganizations() {
  const rows = await query(`
    SELECT
      o.organization_id AS organizationId,
      o.organization_name AS organizationName,
      o.organization_code AS organizationCode,
      o.status,
      o.created_at AS createdAt,
      o.updated_at AS updatedAt,
      COUNT(DISTINCT u.user_id) AS userCount,
      COUNT(DISTINCT p.project_id) AS projectCount
    FROM organization o
    LEFT JOIN app_user u ON u.organization_id = o.organization_id
    LEFT JOIN project p ON p.organization_id = o.organization_id
    GROUP BY o.organization_id, o.organization_name, o.organization_code, o.status, o.created_at, o.updated_at
    ORDER BY o.created_at DESC, o.organization_id DESC
  `);
  return rows.map(mapOrganization);
}

async function listOrganizationOptions({ activeOnly = false } = {}) {
  const rows = await query(
    `
      SELECT organization_id AS organizationId,
             organization_name AS organizationName,
             organization_code AS organizationCode,
             status
      FROM organization
      ${activeOnly ? "WHERE UPPER(status) = 'ACTIVE'" : ''}
      ORDER BY organization_name ASC
    `,
  );
  return rows;
}

async function findById(organizationId) {
  const rows = await query(
    `
      SELECT organization_id AS organizationId,
             organization_name AS organizationName,
             organization_code AS organizationCode,
             status,
             created_at AS createdAt,
             updated_at AS updatedAt
      FROM organization
      WHERE organization_id = ?
      LIMIT 1
    `,
    [organizationId],
  );
  return rows[0] ? mapOrganization(rows[0]) : null;
}

async function findByCode(organizationCode, excludeOrganizationId = null) {
  const params = [String(organizationCode || '').trim().toUpperCase()];
  let excludeSql = '';
  if (excludeOrganizationId) {
    excludeSql = 'AND organization_id <> ?';
    params.push(excludeOrganizationId);
  }
  const rows = await query(
    `
      SELECT organization_id AS organizationId
      FROM organization
      WHERE UPPER(organization_code) = ?
      ${excludeSql}
      LIMIT 1
    `,
    params,
  );
  return rows[0] || null;
}

async function createOrganization(values) {
  const [result] = await pool.promise().query(
    `
      INSERT INTO organization (organization_name, organization_code, status)
      VALUES (?, ?, ?)
    `,
    [values.organizationName, values.organizationCode, values.status],
  );
  return findById(result.insertId);
}

async function updateOrganization(organizationId, values) {
  const [result] = await pool.promise().query(
    `
      UPDATE organization
      SET organization_name = ?,
          organization_code = ?,
          status = ?,
          updated_at = NOW()
      WHERE organization_id = ?
    `,
    [values.organizationName, values.organizationCode, values.status, organizationId],
  );
  return result.affectedRows > 0 ? findById(organizationId) : null;
}

async function getOrganizationSummary(organizationId) {
  const rows = await query(
    `
      SELECT
        o.organization_id AS organizationId,
        o.organization_name AS organizationName,
        o.organization_code AS organizationCode,
        o.status,
        COUNT(DISTINCT u.user_id) AS totalUsers,
        COUNT(DISTINCT p.project_id) AS totalProjects,
        COUNT(DISTINCT CASE
          WHEN UPPER(COALESCE(p.workflow_status, p.status, 'APPROVED')) NOT IN ('COMPLETED', 'COMPLETE')
          THEN p.project_id
        END) AS activeProjects,
        COUNT(DISTINCT CASE
          WHEN UPPER(COALESCE(p.workflow_status, p.status, '')) IN ('COMPLETED', 'COMPLETE')
          THEN p.project_id
        END) AS completedProjects,
        COUNT(DISTINCT cr.cr_id) AS totalCrs,
        GREATEST(
          COALESCE(MAX(u.updated_at), TIMESTAMP('1970-01-01')),
          COALESCE(MAX(p.updated_at), TIMESTAMP('1970-01-01')),
          COALESCE(MAX(cr.updated_at), TIMESTAMP('1970-01-01')),
          COALESCE(MAX(o.updated_at), TIMESTAMP('1970-01-01'))
        ) AS lastActivityDate
      FROM organization o
      LEFT JOIN app_user u ON u.organization_id = o.organization_id
      LEFT JOIN project p ON p.organization_id = o.organization_id
      LEFT JOIN change_request cr ON cr.organization_id = o.organization_id
      WHERE o.organization_id = ?
      GROUP BY o.organization_id, o.organization_name, o.organization_code, o.status
      LIMIT 1
    `,
    [organizationId],
  );
  return rows[0] ? mapOrganizationSummary(rows[0]) : null;
}

module.exports = {
  createOrganization,
  findByCode,
  findById,
  getOrganizationSummary,
  listOrganizationOptions,
  listOrganizations,
  updateOrganization,
};
