DELIMITER $$

DROP PROCEDURE IF EXISTS rename_column_if_present $$
CREATE PROCEDURE rename_column_if_present(
  IN p_table_name VARCHAR(64),
  IN p_old_column_name VARCHAR(64),
  IN p_new_column_name VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND COLUMN_NAME = p_old_column_name
  ) AND NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND COLUMN_NAME = p_new_column_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE ', p_table_name, ' CHANGE COLUMN ', p_old_column_name, ' ', p_new_column_name, ' ', p_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS drop_column_if_present $$
CREATE PROCEDURE drop_column_if_present(
  IN p_table_name VARCHAR(64),
  IN p_column_name VARCHAR(64)
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND COLUMN_NAME = p_column_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE ', p_table_name, ' DROP COLUMN ', p_column_name);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

CALL rename_column_if_present('ml_prediction_log', 'project_draft_id', 'project_id', 'BIGINT UNSIGNED NULL');
CALL rename_column_if_present('ml_prediction_feedback', 'project_draft_id', 'project_id', 'BIGINT UNSIGNED NULL');
CALL drop_column_if_present('project', 'source_draft_id');
CALL drop_column_if_present('project_completion_history', 'source_draft_id');

DROP TABLE IF EXISTS project_drafts;

DROP PROCEDURE IF EXISTS rename_column_if_present;
DROP PROCEDURE IF EXISTS drop_column_if_present;
