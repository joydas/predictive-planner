const { pool } = require('../config/db.config');

async function listRoles() {
  const [rows] = await pool.promise().query(
    `
      SELECT role_id AS roleId,
             role_name AS roleName,
             role_category AS roleCategory,
             active_flag AS activeFlag
      FROM md_role
      WHERE active_flag = 1
      ORDER BY role_category, role_name
    `,
  );
  return rows;
}

async function listSkills() {
  const [rows] = await pool.promise().query(
    `
      SELECT skill_id AS skillId,
             skill_name AS skillName,
             skill_category AS skillCategory,
             active_flag AS activeFlag
      FROM md_skill
      WHERE active_flag = 1
      ORDER BY skill_category, skill_name
    `,
  );
  return rows;
}

async function listRateCards() {
  const [rows] = await pool.promise().query(
    `
      SELECT rc.rate_card_id AS rateCardId,
             rc.role_id AS roleId,
             r.role_name AS roleName,
             rc.location_type AS locationType,
             rc.rate_per_day AS ratePerDay,
             rc.currency,
             rc.effective_from AS effectiveFrom,
             rc.effective_to AS effectiveTo,
             rc.active_flag AS activeFlag
      FROM md_rate_card rc
      INNER JOIN md_role r ON r.role_id = rc.role_id
      WHERE rc.active_flag = 1
        AND r.active_flag = 1
        AND rc.effective_from <= CURRENT_DATE()
        AND (rc.effective_to IS NULL OR rc.effective_to >= CURRENT_DATE())
      ORDER BY r.role_name, rc.location_type
    `,
  );
  return rows;
}

async function getPlanningMasterData() {
  const [roles, skills, rateCards] = await Promise.all([
    listRoles(),
    listSkills(),
    listRateCards(),
  ]);
  return { roles, skills, rateCards };
}

module.exports = {
  getPlanningMasterData,
  listRateCards,
  listRoles,
  listSkills,
};
