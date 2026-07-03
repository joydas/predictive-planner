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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
ON DUPLICATE KEY UPDATE industry_name = VALUES(industry_name), is_active = VALUES(is_active);

ALTER TABLE project
  ADD COLUMN industry_code VARCHAR(50) NULL AFTER industry,
  ADD INDEX idx_project_industry_code (industry_code);

UPDATE project p
LEFT JOIN md_industry mi
  ON LOWER(mi.industry_name) = LOWER(p.industry)
  OR LOWER(mi.industry_code) = LOWER(p.industry)
SET p.industry_code = mi.industry_code,
    p.industry = COALESCE(mi.industry_name, p.industry)
WHERE p.industry_code IS NULL
  AND p.industry IS NOT NULL
  AND p.industry <> '';
