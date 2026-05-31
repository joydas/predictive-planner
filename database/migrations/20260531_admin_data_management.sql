ALTER TABLE project
ADD COLUMN IF NOT EXISTS is_regression_data TINYINT(1) NOT NULL DEFAULT 0
AFTER approved_data;

ALTER TABLE project_drafts
ADD COLUMN IF NOT EXISTS is_regression_data TINYINT(1) NOT NULL DEFAULT 0
AFTER published_at;
