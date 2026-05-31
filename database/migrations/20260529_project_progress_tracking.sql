ALTER TABLE project
ADD COLUMN IF NOT EXISTS actual_completion_date DATE NULL
AFTER actual_final_estimated_value;

ALTER TABLE project_completion_history
ADD COLUMN IF NOT EXISTS actual_completion_date DATE NULL
AFTER actual_final_estimated_value;

CREATE TABLE IF NOT EXISTS project_progress_snapshot (
  snapshot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  snapshot_date DATE NOT NULL,
  actual_effort_pd DECIMAL(12,2) NOT NULL DEFAULT 0,
  actual_budget DECIMAL(14,2) NOT NULL DEFAULT 0,
  actual_team_size DECIMAL(10,2) NOT NULL DEFAULT 0,
  actual_completion_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  remarks TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (snapshot_id),
  UNIQUE KEY uq_project_progress_snapshot_date (project_id, snapshot_date),
  INDEX idx_project_progress_project (project_id),
  INDEX idx_project_progress_snapshot_date (snapshot_date),
  INDEX idx_project_progress_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE project_progress_snapshot
ADD CONSTRAINT fk_progress_project
FOREIGN KEY (project_id)
REFERENCES project(project_id);