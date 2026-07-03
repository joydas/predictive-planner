CREATE TABLE app_user (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_name VARCHAR(64) NOT NULL,
  manager_id BIGINT UNSIGNED NULL,
  active_flag TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_app_user_email (email),
  INDEX idx_app_user_manager (manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE md_role (
  role_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_name VARCHAR(100) NOT NULL,
  role_category VARCHAR(100) NOT NULL,
  active_flag TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id),
  UNIQUE KEY uq_md_role_name (role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE md_skill (
  skill_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  skill_name VARCHAR(100) NOT NULL,
  skill_category VARCHAR(100) NOT NULL,
  active_flag TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (skill_id),
  UNIQUE KEY uq_md_skill_name (skill_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE md_rate_card (
  rate_card_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id BIGINT UNSIGNED NOT NULL,
  location_type ENUM('ONSITE', 'OFFSHORE') NOT NULL,
  rate_per_day DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  active_flag TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (rate_card_id),
  UNIQUE KEY uq_md_rate_card_role_location_effective (role_id, location_type, effective_from),
  INDEX idx_md_rate_card_active (active_flag, effective_from, effective_to),
  CONSTRAINT fk_md_rate_card_role FOREIGN KEY (role_id) REFERENCES md_role(role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE md_industry (
  industry_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  industry_code VARCHAR(50) NOT NULL,
  industry_name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (industry_id),
  UNIQUE KEY uq_md_industry_code (industry_code),
  UNIQUE KEY uq_md_industry_name (industry_name),
  INDEX idx_md_industry_active_name (is_active, industry_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE project_workflow_history (
  workflow_history_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  action_by_user_id BIGINT UNSIGNED NOT NULL,
  action_by_role VARCHAR(64) NOT NULL,
  action_comment TEXT NOT NULL,
  action_type VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workflow_history_id),
  INDEX idx_project_workflow_history_entity (project_id),
  INDEX idx_project_workflow_history_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE project (
  project_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id BIGINT UNSIGNED NOT NULL,
  project_code VARCHAR(32) NULL,
  project_name VARCHAR(255) NOT NULL,
  client_name VARCHAR(255) NULL,
  industry VARCHAR(100) NULL,
  industry_code VARCHAR(50) NULL,
  project_type VARCHAR(100) NULL,
  delivery_model VARCHAR(100) NULL,
  technology_stack VARCHAR(255) NULL,
  complexity DECIMAL(10,2) NULL DEFAULT 0,
  estimated_team_size DECIMAL(10,2) NULL DEFAULT 0,
  planned_effort DECIMAL(12,2) NULL DEFAULT 0,
  budget DECIMAL(14,2) NULL DEFAULT 0,
  predicted_hours DECIMAL(12,2) NULL DEFAULT 0,
  pm_estimated_value DECIMAL(12,2) NULL DEFAULT NULL,
  ai_estimated_value DECIMAL(12,2) NULL DEFAULT NULL,
  ai_baseline_effort DECIMAL(12,2) NULL DEFAULT NULL,
  ai_baseline_budget DECIMAL(14,2) NULL DEFAULT NULL,
  ai_baseline_team_size DECIMAL(10,2) NULL DEFAULT NULL,
  pm_baseline_effort DECIMAL(12,2) NULL DEFAULT NULL,
  pm_baseline_budget DECIMAL(14,2) NULL DEFAULT NULL,
  pm_baseline_team_size DECIMAL(10,2) NULL DEFAULT NULL,
  current_planned_effort DECIMAL(12,2) NOT NULL DEFAULT 0,
  current_planned_budget DECIMAL(14,2) NOT NULL DEFAULT 0,
  current_planned_team_size DECIMAL(10,2) NOT NULL DEFAULT 0,
  actual_effort DECIMAL(12,2) NULL DEFAULT NULL,
  actual_budget DECIMAL(14,2) NULL DEFAULT NULL,
  actual_team_size DECIMAL(10,2) NULL DEFAULT NULL,
  actual_final_estimated_value DECIMAL(12,2) NULL DEFAULT NULL,
  actual_completion_date DATE NULL,
  total_cr_effort_impact DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_cr_budget_impact DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_cr_team_impact DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_cr_estimation_impact DECIMAL(12,2) NOT NULL DEFAULT 0,
  approved_data JSON NOT NULL,
  approved_by_user_id BIGINT UNSIGNED NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id),
  INDEX idx_project_owner_id (owner_id),
  INDEX idx_project_industry_code (industry_code),
  INDEX idx_project_approved_at (approved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE project_progress_snapshot (
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

CREATE TABLE project_team_snapshot (
  team_snapshot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NULL,
  role VARCHAR(100) NULL,
  location_type VARCHAR(20) NULL,
  resource_count DECIMAL(10,2) NULL DEFAULT 0,
  allocation_percent DECIMAL(10,2) NULL DEFAULT 100,
  allocation_start_date DATE NULL,
  allocation_end_date DATE NULL,
  rate_per_day DECIMAL(12,2) NULL DEFAULT 0,
  planned_effort DECIMAL(12,2) NULL DEFAULT 0,
  planned_cost DECIMAL(14,2) NULL DEFAULT 0,
  avg_experience_years DECIMAL(10,2) NULL DEFAULT 0,
  location VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_snapshot_id),
  INDEX idx_project_team_snapshot_project (project_id),
  INDEX idx_project_team_snapshot_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE project_completion_history (
  completion_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  completed_by_user_id BIGINT UNSIGNED NOT NULL,
  final_resource_loading JSON NOT NULL,
  management_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  contingency_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  resource_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  full_project_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  dependency_count DECIMAL(10,2) NULL DEFAULT NULL,
  requirement_stability_index DECIMAL(10,2) NULL DEFAULT NULL,
  actual_cr_volatility VARCHAR(50) NULL DEFAULT NULL,
  risk_level_indicators JSON NULL,
  actual_final_estimated_value DECIMAL(12,2) NULL DEFAULT NULL,
  actual_completion_date DATE NULL,
  completion_payload JSON NOT NULL,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (completion_id),
  INDEX idx_project_completion_project (project_id),
  INDEX idx_project_completion_completed_at (completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE project_completion_resource_loading (
  completion_resource_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  completion_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(100) NOT NULL,
  location VARCHAR(100) NOT NULL,
  resource_count DECIMAL(10,2) NOT NULL DEFAULT 0,
  rate DECIMAL(14,2) NOT NULL DEFAULT 0,
  effort DECIMAL(14,2) NOT NULL DEFAULT 0,
  actual_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (completion_resource_id),
  INDEX idx_completion_resource_completion (completion_id),
  INDEX idx_completion_resource_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE resource_master (
  resource_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_code VARCHAR(64) NOT NULL,
  employee_name VARCHAR(255) NOT NULL,
  primary_role_id BIGINT UNSIGNED NOT NULL,
  location_type ENUM('ONSITE', 'OFFSHORE') NOT NULL DEFAULT 'ONSITE',
  years_experience DECIMAL(5,2) NOT NULL DEFAULT 0,
  employment_type VARCHAR(50) NOT NULL DEFAULT 'Permanent',
  joining_date DATE NULL,
  active_flag TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (resource_id),
  INDEX idx_resource_master_role (primary_role_id),
  INDEX idx_resource_master_location (location_type),
  CONSTRAINT fk_resource_master_role FOREIGN KEY (primary_role_id) REFERENCES md_role(role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE resource_skill_map (
  resource_skill_map_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  resource_id BIGINT UNSIGNED NOT NULL,
  skill_id BIGINT UNSIGNED NOT NULL,
  proficiency_level INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (resource_skill_map_id),
  INDEX idx_resource_skill_map_resource (resource_id),
  INDEX idx_resource_skill_map_skill (skill_id),
  CONSTRAINT fk_resource_skill_map_resource FOREIGN KEY (resource_id) REFERENCES resource_master(resource_id) ON DELETE CASCADE,
  CONSTRAINT fk_resource_skill_map_skill FOREIGN KEY (skill_id) REFERENCES md_skill(skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE resource_allocation (
  allocation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  allocation_percent DECIMAL(5,2) NOT NULL DEFAULT 100,
  allocation_start_date DATE NOT NULL,
  allocation_end_date DATE NOT NULL,
  allocation_status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (allocation_id),
  INDEX idx_resource_allocation_project (project_id),
  INDEX idx_resource_allocation_resource (resource_id),
  INDEX idx_resource_allocation_role (role_id),
  CONSTRAINT fk_resource_allocation_project FOREIGN KEY (project_id) REFERENCES project(project_id) ON DELETE CASCADE,
  CONSTRAINT fk_resource_allocation_resource FOREIGN KEY (resource_id) REFERENCES resource_master(resource_id) ON DELETE CASCADE,
  CONSTRAINT fk_resource_allocation_role FOREIGN KEY (role_id) REFERENCES md_role(role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE change_request (
  cr_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  cr_code VARCHAR(32) NULL,
  cr_title VARCHAR(255) NULL,
  cr_description TEXT NULL,
  cr_category VARCHAR(100) NULL,
  severity VARCHAR(50) NULL,
  priority VARCHAR(50) NULL,
  affected_module VARCHAR(255) NULL,
  schedule_impact_days DECIMAL(10,2) NULL DEFAULT 0,
  estimated_effort_hours DECIMAL(12,2) NULL DEFAULT 0,
  estimated_cost_impact DECIMAL(14,2) NULL DEFAULT 0,
  effort_impact DECIMAL(12,2) NOT NULL DEFAULT 0,
  budget_impact DECIMAL(14,2) NOT NULL DEFAULT 0,
  team_size_impact DECIMAL(10,2) NOT NULL DEFAULT 0,
  dependency_impact TEXT NULL,
  environments_affected VARCHAR(255) NULL,
  additional_pm_count DECIMAL(10,2) NULL DEFAULT 0,
  additional_dev_count DECIMAL(10,2) NULL DEFAULT 0,
  additional_qa_count DECIMAL(10,2) NULL DEFAULT 0,
  additional_devops_count DECIMAL(10,2) NULL DEFAULT 0,
  additional_architect_count DECIMAL(10,2) NULL DEFAULT 0,
  additional_budget DECIMAL(14,2) NULL DEFAULT 0,
  additional_licensing_cost DECIMAL(14,2) NULL DEFAULT 0,
  infrastructure_cost_impact DECIMAL(14,2) NULL DEFAULT 0,
  cr_staffing_baseline_snapshot JSON NULL,
  cr_staffing_delta JSON NULL,
  root_cause TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  workflow_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  submitted_by_user_id BIGINT UNSIGNED NULL,
  approved_by_user_id BIGINT UNSIGNED NULL,
  submitted_at TIMESTAMP NULL DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  latest_comment TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cr_id),
  INDEX idx_change_request_project_id (project_id),
  INDEX idx_change_request_workflow_status (workflow_status),
  INDEX idx_change_request_submitted_by (submitted_by_user_id),
  INDEX idx_change_request_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cr_workflow_history (
  workflow_history_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cr_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  action_by_user_id BIGINT UNSIGNED NOT NULL,
  action_by_role VARCHAR(64) NOT NULL,
  action_comment TEXT NOT NULL,
  action_type VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workflow_history_id),
  INDEX idx_cr_workflow_history_entity (cr_id),
  INDEX idx_cr_workflow_history_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ml_prediction_log (
  prediction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NULL,
  prediction_type VARCHAR(64) NOT NULL,
  request_payload JSON NOT NULL,
  prediction_response JSON NOT NULL,
  generated_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (prediction_id),
  INDEX idx_ml_prediction_log_project (project_id),
  INDEX idx_ml_prediction_log_user (generated_by_user_id),
  INDEX idx_ml_prediction_log_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ml_prediction_feedback (
  feedback_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  prediction_id BIGINT UNSIGNED NULL,
  project_id BIGINT UNSIGNED NULL,
  final_staffing JSON NULL,
  staffing_override_diff JSON NULL,
  final_effort DECIMAL(12,2) NULL DEFAULT 0,
  actual_effort DECIMAL(12,2) NULL DEFAULT NULL,
  actual_schedule_variance DECIMAL(10,2) NULL DEFAULT NULL,
  actual_staffing JSON NULL,
  actual_cr_count INT NULL DEFAULT NULL,
  pm_override_reason TEXT NULL,
  feedback_created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (feedback_id),
  INDEX idx_ml_prediction_feedback_prediction (prediction_id),
  INDEX idx_ml_prediction_feedback_project (project_id),
  INDEX idx_ml_prediction_feedback_created_at (feedback_created_at),
  CONSTRAINT fk_ml_prediction_feedback_prediction
    FOREIGN KEY (prediction_id) REFERENCES ml_prediction_log(prediction_id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
