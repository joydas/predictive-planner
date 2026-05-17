ALTER TABLE project
  ADD COLUMN ai_baseline_effort DECIMAL(12,2) NULL DEFAULT NULL AFTER predicted_hours,
  ADD COLUMN ai_baseline_budget DECIMAL(14,2) NULL DEFAULT NULL AFTER ai_baseline_effort,
  ADD COLUMN ai_baseline_team_size DECIMAL(10,2) NULL DEFAULT NULL AFTER ai_baseline_budget,
  ADD COLUMN pm_baseline_effort DECIMAL(12,2) NULL DEFAULT NULL AFTER ai_baseline_team_size,
  ADD COLUMN pm_baseline_budget DECIMAL(14,2) NULL DEFAULT NULL AFTER pm_baseline_effort,
  ADD COLUMN pm_baseline_team_size DECIMAL(10,2) NULL DEFAULT NULL AFTER pm_baseline_budget,
  ADD COLUMN current_planned_effort DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER pm_baseline_team_size,
  ADD COLUMN current_planned_budget DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER current_planned_effort,
  ADD COLUMN current_planned_team_size DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER current_planned_budget,
  ADD COLUMN actual_effort DECIMAL(12,2) NULL DEFAULT NULL AFTER current_planned_team_size,
  ADD COLUMN actual_budget DECIMAL(14,2) NULL DEFAULT NULL AFTER actual_effort,
  ADD COLUMN actual_team_size DECIMAL(10,2) NULL DEFAULT NULL AFTER actual_budget,
  ADD COLUMN total_cr_effort_impact DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER actual_team_size,
  ADD COLUMN total_cr_budget_impact DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER total_cr_effort_impact,
  ADD COLUMN total_cr_team_impact DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total_cr_budget_impact;

UPDATE project
SET
  pm_baseline_effort = COALESCE(pm_baseline_effort, planned_effort, 0),
  pm_baseline_budget = COALESCE(pm_baseline_budget, budget, 0),
  pm_baseline_team_size = COALESCE(pm_baseline_team_size, estimated_team_size, 0),
  current_planned_effort = COALESCE(NULLIF(current_planned_effort, 0), planned_effort, 0),
  current_planned_budget = COALESCE(NULLIF(current_planned_budget, 0), budget, 0),
  current_planned_team_size = COALESCE(NULLIF(current_planned_team_size, 0), estimated_team_size, 0);

ALTER TABLE change_request
  ADD COLUMN effort_impact DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER estimated_cost_impact,
  ADD COLUMN budget_impact DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER effort_impact,
  ADD COLUMN team_size_impact DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER budget_impact;

UPDATE change_request
SET
  effort_impact = COALESCE(estimated_effort_hours, 0),
  budget_impact = COALESCE(estimated_cost_impact, 0)
    + COALESCE(additional_budget, 0)
    + COALESCE(additional_licensing_cost, 0)
    + COALESCE(infrastructure_cost_impact, 0),
  team_size_impact = COALESCE(additional_pm_count, 0)
    + COALESCE(additional_dev_count, 0)
    + COALESCE(additional_qa_count, 0)
    + COALESCE(additional_devops_count, 0)
    + COALESCE(additional_architect_count, 0);
