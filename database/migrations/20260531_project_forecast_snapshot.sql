CREATE TABLE IF NOT EXISTS project_forecast_snapshot (
  snapshot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  snapshot_date DATE NOT NULL,
  forecast_completion_date DATE NULL,
  forecast_delay_days INT NULL,
  forecast_final_effort DECIMAL(14,2) NULL,
  forecast_final_budget DECIMAL(16,2) NULL,
  forecast_confidence DECIMAL(5,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (snapshot_id),
  UNIQUE KEY uq_project_forecast_snapshot_date (project_id, snapshot_date),
  INDEX idx_project_forecast_snapshot_project (project_id),
  INDEX idx_project_forecast_snapshot_date (snapshot_date),
  CONSTRAINT fk_project_forecast_snapshot_project
    FOREIGN KEY (project_id)
    REFERENCES project(project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
