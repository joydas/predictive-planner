-- Multi-Tenant SaaS Foundation Migration
-- Phase 1: Organization Entity and Data Isolation

-- 1. Create Organization Table
CREATE TABLE IF NOT EXISTS organization (
  organization_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_code VARCHAR(32) NOT NULL,
  organization_name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id),
  UNIQUE KEY uq_organization_code (organization_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Seed Default Organization
INSERT IGNORE INTO organization (organization_id, organization_code, organization_name, status)
VALUES (1, 'DEFAULT', 'Default Organization', 'ACTIVE');

-- 3. Add organization_id to Business Tables
-- We use a procedure to make it idempotent and safe

DELIMITER $$

DROP PROCEDURE IF EXISTS add_organization_id_column $$
CREATE PROCEDURE add_organization_id_column(IN tableName VARCHAR(64))
BEGIN
    -- Add column if not exists
    IF NOT EXISTS (
        SELECT * FROM information_schema.columns 
        WHERE table_schema = DATABASE() 
        AND table_name = tableName 
        AND column_name = 'organization_id'
    ) THEN
        SET @sql = CONCAT('ALTER TABLE ', tableName, ' ADD COLUMN organization_id BIGINT UNSIGNED NULL AFTER ', 
            (SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tableName ORDER BY ordinal_position LIMIT 1));
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;

        -- Populate existing data with Default Organization (ID 1)
        SET @sql = CONCAT('UPDATE ', tableName, ' SET organization_id = 1 WHERE organization_id IS NULL');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;

        -- Make NOT NULL and add Foreign Key
        SET @sql = CONCAT('ALTER TABLE ', tableName, ' MODIFY COLUMN organization_id BIGINT UNSIGNED NOT NULL');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;

        SET @sql = CONCAT('ALTER TABLE ', tableName, ' ADD CONSTRAINT fk_', tableName, '_org FOREIGN KEY (organization_id) REFERENCES organization(organization_id)');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;

        SET @sql = CONCAT('CREATE INDEX idx_', tableName, '_org ON ', tableName, '(organization_id)');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$

DELIMITER ;

-- Apply to identified tables
CALL add_organization_id_column('app_user');
CALL add_organization_id_column('project');
CALL add_organization_id_column('change_request');
CALL add_organization_id_column('project_progress_snapshot');
CALL add_organization_id_column('project_team_snapshot');
CALL add_organization_id_column('project_completion_history');
CALL add_organization_id_column('project_completion_resource_loading');
CALL add_organization_id_column('resource_master');
CALL add_organization_id_column('resource_allocation');
CALL add_organization_id_column('ml_prediction_log');
CALL add_organization_id_column('ml_prediction_feedback');
CALL add_organization_id_column('project_workflow_history');
CALL add_organization_id_column('cr_workflow_history');
CALL add_organization_id_column('project_forecast_snapshot');
CALL add_organization_id_column('regression_run');
CALL add_organization_id_column('regression_run_detail');

-- Optional: Add to master data if tenant-specific customizations are needed later
-- CALL add_organization_id_column('md_rate_card');

DROP PROCEDURE IF EXISTS add_organization_id_column;
