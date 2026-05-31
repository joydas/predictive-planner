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

async function ensureIndustryMasterTable() {
  await pool.promise().query(`
    CREATE TABLE IF NOT EXISTS md_industry (
      industry_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      industry_code VARCHAR(50) NOT NULL,
      industry_name VARCHAR(100) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (industry_id),
      UNIQUE KEY uq_md_industry_code (industry_code),
      UNIQUE KEY uq_md_industry_name (industry_name),
      INDEX idx_md_industry_active_name (is_active, industry_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.promise().query(`
    INSERT INTO md_industry (industry_code, industry_name, is_active) VALUES
    ('BFSI', 'Banking, Financial Services and Insurance', 1),
    ('HEALTHCARE', 'Healthcare', 1),
    ('RETAIL', 'Retail', 1),
    ('TELECOM', 'Telecom', 1),
    ('MANUFACTURING', 'Manufacturing', 1),
    ('ENERGY_UTILITIES', 'Energy and Utilities', 1),
    ('PUBLIC_SECTOR', 'Public Sector', 1),
    ('TECHNOLOGY', 'Technology', 1),
    ('MEDIA_ENTERTAINMENT', 'Media and Entertainment', 1),
    ('TRANSPORTATION_LOGISTICS', 'Transportation and Logistics', 1)
    ON DUPLICATE KEY UPDATE industry_name = VALUES(industry_name), is_active = VALUES(is_active)
  `);
}

async function listIndustries() {
  await ensureIndustryMasterTable();
  const [rows] = await pool.promise().query(
    `
      SELECT industry_id AS industryId,
             industry_code AS industryCode,
             industry_name AS industryName,
             is_active AS isActive
      FROM md_industry
      WHERE is_active = 1
      ORDER BY industry_name
    `,
  );
  return rows;
}

async function getPlanningMasterData() {
  const [roles, skills, rateCards, industries] = await Promise.all([
    listRoles(),
    listSkills(),
    listRateCards(),
    listIndustries(),
  ]);
  return { roles, skills, rateCards, industries };
}

module.exports = {
  getPlanningMasterData,
  listIndustries,
  listRateCards,
  listRoles,
  listSkills,
};
