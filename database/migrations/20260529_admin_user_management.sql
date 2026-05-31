ALTER TABLE app_user
ADD COLUMN IF NOT EXISTS manager_id BIGINT UNSIGNED NULL
AFTER role_name;

ALTER TABLE app_user
ADD INDEX IF NOT EXISTS idx_app_user_manager (manager_id);

UPDATE app_user
SET manager_id = NULL
WHERE role_name IN ('ADMIN', 'AM', 'ACCOUNT_MANAGER')
  AND manager_id IS NOT NULL;

INSERT INTO app_user
(
    user_name,
    email,
    password_hash,
    role_name,
    active_flag
)
VALUES
(
    'admin',
    'admin@test.com',
    '$2a$10$uyR12.qieJUHfnm9U35vMOk02fsM6ot4V/bL5OmTgFh7pvUKdTcg.',
    'ADMIN',
    1
);