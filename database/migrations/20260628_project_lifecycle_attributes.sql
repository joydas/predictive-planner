-- Migration to add project table lifecycle columns that were previously handled dynamically.

ALTER TABLE project
  ADD COLUMN IF NOT EXISTS business_criticality VARCHAR(50) NULL AFTER delivery_model,
  ADD COLUMN IF NOT EXISTS architecture_type VARCHAR(100) NULL AFTER technology_stack,
  ADD COLUMN IF NOT EXISTS cloud_platform VARCHAR(100) NULL AFTER architecture_type,
  ADD COLUMN IF NOT EXISTS billing_model VARCHAR(100) NULL AFTER budget,
  ADD COLUMN IF NOT EXISTS start_date DATE NULL AFTER billing_model,
  ADD COLUMN IF NOT EXISTS planned_end_date DATE NULL AFTER start_date,
  ADD COLUMN IF NOT EXISTS is_regression_data TINYINT(1) NOT NULL DEFAULT 0 AFTER approved_data;
