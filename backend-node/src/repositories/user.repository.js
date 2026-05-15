const { pool } = require('../config/db.config');

/**
 * Find a user by email from the app_user table.
 * This repository returns normalized fields for service consumption.
 */
async function findByEmail(email) {
  const query = `
    SELECT
      user_id AS userId,
      user_name AS userName,
      email,
      password_hash AS passwordHash,
      role_name AS role,
      active_flag AS activeFlag
    FROM app_user
    WHERE LOWER(email) = ?
    LIMIT 1
  `;

  const [rows] = await pool.promise().query(query, [email]);
  return rows[0] || null;
}

module.exports = {
  findByEmail,
};
