const { pool } = require('../config/db.config');

/**
 * Find a user by email from the app_user table.
 * This repository returns normalized fields for service consumption.
 */
async function findByEmail(email) {
  await ensureUserAdministrationSchema();
  const query = `
    SELECT
      user_id AS userId,
      user_name AS userName,
      email,
      password_hash AS passwordHash,
      role_name AS role,
      manager_id AS managerId,
      active_flag AS activeFlag
    FROM app_user
    WHERE LOWER(email) = ?
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
        AND COLUMN_NAME = 'manager_id'
      LIMIT 1
    `,
  );
  if (!columns.length) {
    await pool.promise().query(`
      ALTER TABLE app_user
      ADD COLUMN manager_id BIGINT UNSIGNED NULL AFTER role_name,
      ADD INDEX idx_app_user_manager (manager_id)
    `);
  }
}

function mapUser(row) {
  return {
    userId: row.userId,
    id: row.userId,
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

async function listUsers() {
  await ensureUserAdministrationSchema();
  const [rows] = await pool.promise().query(
    `
      SELECT u.user_id AS userId,
             u.user_name AS userName,
             u.email,
             u.role_name AS role,
             u.manager_id AS managerId,
             m.user_name AS managerName,
             u.active_flag AS activeFlag,
             u.created_at AS createdAt,
             u.updated_at AS updatedAt
      FROM app_user u
      LEFT JOIN app_user m ON m.user_id = u.manager_id
      ORDER BY u.updated_at DESC, u.user_id DESC
    `,
  );
  return rows.map(mapUser);
}

async function listActiveAccountManagers() {
  await ensureUserAdministrationSchema();
  const [rows] = await pool.promise().query(
    `
      SELECT user_id AS userId,
             user_name AS userName,
             email,
             role_name AS role
      FROM app_user
      WHERE active_flag = 1
        AND role_name IN ('AM', 'ACCOUNT_MANAGER')
      ORDER BY user_name ASC
    `,
  );
  return rows.map(mapUser);
}

async function findById(userId) {
  await ensureUserAdministrationSchema();
  const [rows] = await pool.promise().query(
    `
      SELECT u.user_id AS userId,
             u.user_name AS userName,
             u.email,
             u.role_name AS role,
             u.manager_id AS managerId,
             m.user_name AS managerName,
             u.active_flag AS activeFlag,
             u.created_at AS createdAt,
             u.updated_at AS updatedAt
      FROM app_user u
      LEFT JOIN app_user m ON m.user_id = u.manager_id
      WHERE u.user_id = ?
      LIMIT 1
    `,
    [userId],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

async function createUser(user) {
  await ensureUserAdministrationSchema();
  const [result] = await pool.promise().query(
    `
      INSERT INTO app_user (user_name, email, password_hash, role_name, manager_id, active_flag)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [user.userName, user.email, user.passwordHash, user.role, user.managerId || null, user.activeFlag ? 1 : 0],
  );
  return findById(result.insertId);
}

async function updateUser(userId, user) {
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

  const [result] = await pool.promise().query(
    `
      UPDATE app_user
      SET user_name = ?,
          email = ?,
          role_name = ?,
          manager_id = ?,
          active_flag = ?${passwordSql},
          updated_at = NOW()
      WHERE user_id = ?
    `,
    values,
  );
  return result.affectedRows > 0 ? findById(userId) : null;
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
