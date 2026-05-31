ALTER TABLE project
  ADD COLUMN pm_estimated_value DECIMAL(12,2) NULL DEFAULT NULL AFTER predicted_hours,
  ADD COLUMN ai_estimated_value DECIMAL(12,2) NULL DEFAULT NULL AFTER pm_estimated_value,
  ADD COLUMN actual_final_estimated_value DECIMAL(12,2) NULL DEFAULT NULL AFTER actual_team_size,
  ADD COLUMN total_cr_estimation_impact DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER total_cr_team_impact;

UPDATE project
SET
  pm_estimated_value = COALESCE(
    pm_estimated_value,
    JSON_UNQUOTE(JSON_EXTRACT(approved_data, '$.basicInfo.pm_estimated_value')),
    pm_baseline_effort,
    planned_effort,
    0
  ),
  ai_estimated_value = COALESCE(
    ai_estimated_value,
    JSON_UNQUOTE(JSON_EXTRACT(approved_data, '$.mlRecommendation.recommendation.estimation.recommendedValue')),
    ai_baseline_effort
  ),
  actual_final_estimated_value = COALESCE(
    actual_final_estimated_value,
    pm_estimated_value,
    JSON_UNQUOTE(JSON_EXTRACT(approved_data, '$.basicInfo.pm_estimated_value')),
    pm_baseline_effort,
    planned_effort,
    0
  );

ALTER TABLE project_completion_history
  ADD COLUMN actual_final_estimated_value DECIMAL(12,2) NULL DEFAULT NULL AFTER risk_level_indicators;
