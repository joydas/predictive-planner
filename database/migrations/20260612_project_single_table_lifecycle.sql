-- Phase 1: single project table lifecycle foundation.
-- This migration is intentionally additive and keeps project_drafts intact.

DELIMITER $$

DROP PROCEDURE IF EXISTS add_project_lifecycle_column $$
CREATE PROCEDURE add_project_lifecycle_column(
  IN p_column_name VARCHAR(64),
  IN p_alter_sql TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project'
      AND COLUMN_NAME = p_column_name
  ) THEN
    SET @ddl = p_alter_sql;
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS make_project_source_draft_nullable $$
CREATE PROCEDURE make_project_source_draft_nullable()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project'
      AND COLUMN_NAME = 'source_draft_id'
      AND IS_NULLABLE = 'NO'
  ) THEN
    ALTER TABLE project MODIFY source_draft_id BIGINT UNSIGNED NULL;
  END IF;
END $$

DROP PROCEDURE IF EXISTS seed_project_workflow_statuses $$
CREATE PROCEDURE seed_project_workflow_statuses()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'workflow_status_master'
  ) THEN
    INSERT INTO workflow_status_master (entity_type, status_code, status_name)
    SELECT 'PROJECT', 'DRAFT', 'Draft'
    WHERE NOT EXISTS (
      SELECT 1 FROM workflow_status_master WHERE entity_type = 'PROJECT' AND status_code = 'DRAFT'
    );
    INSERT INTO workflow_status_master (entity_type, status_code, status_name)
    SELECT 'PROJECT', 'SUBMITTED', 'Submitted'
    WHERE NOT EXISTS (
      SELECT 1 FROM workflow_status_master WHERE entity_type = 'PROJECT' AND status_code = 'SUBMITTED'
    );
    INSERT INTO workflow_status_master (entity_type, status_code, status_name)
    SELECT 'PROJECT', 'APPROVED', 'Approved'
    WHERE NOT EXISTS (
      SELECT 1 FROM workflow_status_master WHERE entity_type = 'PROJECT' AND status_code = 'APPROVED'
    );
    INSERT INTO workflow_status_master (entity_type, status_code, status_name)
    SELECT 'PROJECT', 'ACTIVE', 'Active'
    WHERE NOT EXISTS (
      SELECT 1 FROM workflow_status_master WHERE entity_type = 'PROJECT' AND status_code = 'ACTIVE'
    );
    INSERT INTO workflow_status_master (entity_type, status_code, status_name)
    SELECT 'PROJECT', 'COMPLETED', 'Completed'
    WHERE NOT EXISTS (
      SELECT 1 FROM workflow_status_master WHERE entity_type = 'PROJECT' AND status_code = 'COMPLETED'
    );
    INSERT INTO workflow_status_master (entity_type, status_code, status_name)
    SELECT 'PROJECT', 'REJECTED', 'Rejected'
    WHERE NOT EXISTS (
      SELECT 1 FROM workflow_status_master WHERE entity_type = 'PROJECT' AND status_code = 'REJECTED'
    );
    INSERT INTO workflow_status_master (entity_type, status_code, status_name)
    SELECT 'PROJECT', 'RETURNED', 'Returned'
    WHERE NOT EXISTS (
      SELECT 1 FROM workflow_status_master WHERE entity_type = 'PROJECT' AND status_code = 'RETURNED'
    );
  END IF;
END $$

DROP PROCEDURE IF EXISTS make_project_completion_source_draft_nullable $$
CREATE PROCEDURE make_project_completion_source_draft_nullable()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'project_completion_history'
      AND COLUMN_NAME = 'source_draft_id'
      AND IS_NULLABLE = 'NO'
  ) THEN
    ALTER TABLE project_completion_history MODIFY source_draft_id BIGINT UNSIGNED NULL;
  END IF;
END $$

DELIMITER ;

CALL make_project_source_draft_nullable();
CALL make_project_completion_source_draft_nullable();

CALL add_project_lifecycle_column(
  'status',
  'ALTER TABLE project ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT ''APPROVED'' AFTER owner_id, ADD INDEX idx_project_status (status)'
);
CALL add_project_lifecycle_column(
  'workflow_status',
  'ALTER TABLE project ADD COLUMN workflow_status VARCHAR(32) NOT NULL DEFAULT ''APPROVED'' AFTER status, ADD INDEX idx_project_workflow_status (workflow_status)'
);
CALL add_project_lifecycle_column(
  'current_status_id',
  'ALTER TABLE project ADD COLUMN current_status_id INT NULL AFTER workflow_status'
);
CALL add_project_lifecycle_column(
  'submitted_by_user_id',
  'ALTER TABLE project ADD COLUMN submitted_by_user_id BIGINT UNSIGNED NULL AFTER current_status_id, ADD INDEX idx_project_submitted_by (submitted_by_user_id)'
);
CALL add_project_lifecycle_column(
  'submitted_at',
  'ALTER TABLE project ADD COLUMN submitted_at TIMESTAMP NULL DEFAULT NULL AFTER submitted_by_user_id'
);
CALL add_project_lifecycle_column(
  'latest_comment',
  'ALTER TABLE project ADD COLUMN latest_comment TEXT NULL AFTER approved_at'
);

UPDATE project
SET status = COALESCE(NULLIF(status, ''), 'APPROVED'),
    workflow_status = COALESCE(NULLIF(workflow_status, ''), 'APPROVED')
WHERE source_draft_id IS NOT NULL;

CALL seed_project_workflow_statuses();

DROP PROCEDURE IF EXISTS add_project_lifecycle_column;
DROP PROCEDURE IF EXISTS make_project_source_draft_nullable;
DROP PROCEDURE IF EXISTS make_project_completion_source_draft_nullable;
DROP PROCEDURE IF EXISTS seed_project_workflow_statuses;
