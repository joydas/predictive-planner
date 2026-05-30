CREATE TABLE IF NOT EXISTS regression_run (
  run_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  requested_by_user_id BIGINT UNSIGNED NOT NULL,
  requested_project_count INT NOT NULL DEFAULT 10,
  status VARCHAR(32) NOT NULL DEFAULT 'RUNNING',
  current_stage VARCHAR(100) NULL,
  projects_created INT NOT NULL DEFAULT 0,
  crs_created INT NOT NULL DEFAULT 0,
  progress_snapshots_created INT NOT NULL DEFAULT 0,
  completed_projects_created INT NOT NULL DEFAULT 0,
  forecasts_run INT NOT NULL DEFAULT 0,
  passed_steps INT NOT NULL DEFAULT 0,
  failed_steps INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (run_id),
  INDEX idx_regression_run_status (status),
  INDEX idx_regression_run_started_at (started_at),
  INDEX idx_regression_run_requested_by (requested_by_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS regression_run_detail (
  detail_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  step_name VARCHAR(150) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id BIGINT UNSIGNED NULL,
  status VARCHAR(16) NOT NULL,
  message TEXT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (detail_id),
  INDEX idx_regression_run_detail_run (run_id),
  INDEX idx_regression_run_detail_status (status),
  CONSTRAINT fk_regression_run_detail_run
    FOREIGN KEY (run_id)
    REFERENCES regression_run(run_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE change_request
ADD COLUMN IF NOT EXISTS is_regression_data TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE project_progress_snapshot
ADD COLUMN IF NOT EXISTS is_regression_data TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE project_completion_history
ADD COLUMN IF NOT EXISTS is_regression_data TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE project_completion_resource_loading
ADD COLUMN IF NOT EXISTS is_regression_data TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE project_forecast_snapshot
ADD COLUMN IF NOT EXISTS is_regression_data TINYINT(1) NOT NULL DEFAULT 0;
