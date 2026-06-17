const { pool } = require('../config/db.config');

/**
 * Find a user by email from the app_user table.
 * This repository returns normalized fields for service consumption.
 */
async function findByEmail(email) {
  await ensureUserAdministrationSchema();
  const query = `
    SELECT
      u.user_id AS userId,
      u.organization_id AS organizationId,
      o.organization_name AS organizationName,
      u.user_name AS userName,
      u.email,
      u.password_hash AS passwordHash,
      u.role_name AS role,
      u.manager_id AS managerId,
      u.active_flag AS activeFlag
    FROM app_user u
    JOIN organization o ON o.organization_id = u.organization_id
    WHERE LOWER(u.email) = ?
    LIMIT 1
  `;

  const [rows] = await pool.promise().query(query, [email]);
  return rows[0] || null;
}

async function ensureUserAdministrationSchema() {
  const [columns] = await pool.promise().query(
    `
      SELECT COLUMN_NAME AS columnName
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'app_user'
        AND COLUMN_NAME = 'organization_id'
      LIMIT 1
    `,
  );
  if (!columns.length) {
    // This is a safety check, but the migration script should have handled this.
    // If organization_id is missing, we don't attempt to add it here dynamically 
    // to avoid partial migration state.
    console.warn('organization_id column missing in app_user table. Please run migrations.');
  }
}

function mapUser(row) {
  return {
    userId: row.userId,
    id: row.userId,
    organizationId: row.organizationId,
    userName: row.userName,
    name: row.userName,
    email: row.email,
    role: row.role,
    managerId: row.managerId,
    managerName: row.managerName,
    activeFlag: Boolean(row.activeFlag),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listUsers(organizationId) {
  await ensureUserAdministrationSchema();
  const [rows] = await pool.promise().query(
    `
      SELECT u.user_id AS userId,
             u.organization_id AS organizationId,
             u.user_name AS userName,
             u.email,
             u.role_name AS role,
             u.manager_id AS managerId,
             m.user_name AS managerName,
             u.active_flag AS activeFlag,
             u.created_at AS createdAt,
             u.updated_at AS updatedAt
      FROM app_user u
      LEFT JOIN app_user m ON m.user_id = u.manager_id AND m.organization_id = u.organization_id
      WHERE u.organization_id = ?
      ORDER BY u.updated_at DESC, u.user_id DESC
    `,
    [organizationId]
  );
  return rows.map(mapUser);
}

async function listActiveAccountManagers(organizationId) {
  await ensureUserAdministrationSchema();
  const [rows] = await pool.promise().query(
    `
      SELECT user_id AS userId,
             organization_id AS organizationId,
             user_name AS userName,
             email,
             role_name AS role
      FROM app_user
      WHERE active_flag = 1
        AND role_name IN ('AM', 'ACCOUNT_MANAGER')
        AND organization_id = ?
      ORDER BY user_name ASC
    `,
    [organizationId]
  );
  return rows.map(mapUser);
}

async function findById(userId, organizationId) {
  await ensureUserAdministrationSchema();
  const [rows] = await pool.promise().query(
    `
      SELECT u.user_id AS userId,
             u.organization_id AS organizationId,
             u.user_name AS userName,
             u.email,
             u.role_name AS role,
             u.manager_id AS managerId,
             m.user_name AS managerName,
             u.active_flag AS activeFlag,
             u.created_at AS createdAt,
             u.updated_at AS updatedAt
      FROM app_user u
      LEFT JOIN app_user m ON m.user_id = u.manager_id AND m.organization_id = u.organization_id
      WHERE u.user_id = ? AND u.organization_id = ?
      LIMIT 1
    `,
    [userId, organizationId],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

async function createUser(user) {
  await ensureUserAdministrationSchema();
  const [result] = await pool.promise().query(
    `
      INSERT INTO app_user (organization_id, user_name, email, password_hash, role_name, manager_id, active_flag)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [user.organizationId, user.userName, user.email, user.passwordHash, user.role, user.managerId || null, user.activeFlag ? 1 : 0],
  );
  return findById(result.insertId, user.organizationId);
}

async function updateUser(userId, organizationId, user) {
  await ensureUserAdministrationSchema();
  const values = [
    user.userName,
    user.email,
    user.role,
    user.managerId || null,
    user.activeFlag ? 1 : 0,
  ];
  let passwordSql = '';
  if (user.passwordHash) {
    passwordSql = ', password_hash = ?';
    values.push(user.passwordHash);
  }
  values.push(userId);
  values.push(organizationId);

  const [result] = await pool.promise().query(
    `
      UPDATE app_user
      SET user_name = ?,
          email = ?,
          role_name = ?,
          manager_id = ?,
          active_flag = ?${passwordSql},
          updated_at = NOW()
      WHERE user_id = ? AND organization_id = ?
    `,
    values,
  );
  return result.affectedRows > 0 ? findById(userId, organizationId) : null;
}

module.exports = {
  createUser,
  ensureUserAdministrationSchema,
  findByEmail,
  findById,
  listActiveAccountManagers,
  listUsers,
  updateUser,
};
