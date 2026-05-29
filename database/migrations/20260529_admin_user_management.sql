DROP PROCEDURE IF EXISTS migrate_admin_user_management;

DELIMITER //

CREATE PROCEDURE migrate_admin_user_management()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'app_user'
      AND COLUMN_NAME = 'manager_id'
  ) THEN
    ALTER TABLE app_user
      ADD COLUMN manager_id BIGINT UNSIGNED NULL AFTER role_name;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'app_user'
      AND INDEX_NAME = 'idx_app_user_manager'
  ) THEN
    ALTER TABLE app_user
      ADD INDEX idx_app_user_manager (manager_id);
  END IF;

  UPDATE app_user
  SET manager_id = NULL
  WHERE role_name IN ('ADMIN', 'AM', 'ACCOUNT_MANAGER')
    AND manager_id IS NOT NULL;
END//

DELIMITER ;

CALL migrate_admin_user_management();

DROP PROCEDURE IF EXISTS migrate_admin_user_management;

INSERT INTO users
(
    username,
    email,
    password,
    role,
    is_active
)
VALUES
(
    'admin',
    'admin@test.com',
    '$2a$10$uyR12.qieJUHfnm9U35vMOk02fsM6ot4V/bL5OmTgFh7pvUKdTcg.',
    'ADMIN',
    1
);
