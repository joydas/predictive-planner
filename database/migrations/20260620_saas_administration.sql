-- Lightweight SaaS administration support.
-- Existing organization.status and app_user.active_flag are reused for access control.

DELIMITER $$

DROP PROCEDURE IF EXISTS add_saas_admin_column $$
CREATE PROCEDURE add_saas_admin_column()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'app_user'
      AND COLUMN_NAME = 'last_login_at'
  ) THEN
    ALTER TABLE app_user ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL AFTER active_flag;
  END IF;
END $$

DELIMITER ;

CALL add_saas_admin_column();
DROP PROCEDURE IF EXISTS add_saas_admin_column;
