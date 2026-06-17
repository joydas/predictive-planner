-- ML Model Registry for Multi-Tenant Isolation
CREATE TABLE IF NOT EXISTS ml_model_registry (
  model_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  model_type VARCHAR(64) NOT NULL,
  model_version VARCHAR(64) NOT NULL,
  trained_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  training_record_count INT NOT NULL DEFAULT 0,
  project_count INT NOT NULL DEFAULT 0,
  model_path VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  evaluation_metrics JSON NULL,
  metadata JSON NULL,
  PRIMARY KEY (model_id),
  INDEX idx_ml_model_org (organization_id),
  INDEX idx_ml_model_type (model_type),
  INDEX idx_ml_model_status (status),
  CONSTRAINT fk_ml_model_org FOREIGN KEY (organization_id) REFERENCES organization(organization_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
