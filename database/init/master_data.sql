INSERT INTO md_role (role_name, role_category, active_flag) VALUES
('Program Manager', 'Management', 1),
('Project Manager', 'Management', 1),
('Delivery Manager', 'Management', 1),
('Scrum Master', 'Management', 1),
('Business Analyst', 'Business', 1),
('Product Owner', 'Business', 1),
('Functional Consultant', 'Business', 1),
('Enterprise Architect', 'Architecture', 1),
('Solution Architect', 'Architecture', 1),
('Technical Architect', 'Architecture', 1),
('Java Architect', 'Backend', 1),
('Java Lead', 'Backend', 1),
('Java SSE', 'Backend', 1),
('Java Developer', 'Backend', 1),
('Python Architect', 'Python', 1),
('Python Lead', 'Python', 1),
('Python SSE', 'Python', 1),
('Python Developer', 'Python', 1),
('React Lead', 'Frontend', 1),
('React SSE', 'Frontend', 1),
('React Developer', 'Frontend', 1),
('Angular Developer', 'Frontend', 1),
('Data Engineer', 'Data', 1),
('Data Scientist', 'Data', 1),
('BI Developer', 'Data', 1),
('QA Lead', 'Testing', 1),
('Manual Tester', 'Testing', 1),
('Automation Tester', 'Testing', 1),
('Performance Tester', 'Testing', 1),
('DevOps Engineer', 'DevOps', 1),
('Cloud Engineer', 'DevOps', 1),
('SRE Engineer', 'DevOps', 1),
('SAP Consultant', 'ERP', 1),
('Salesforce Developer', 'ERP', 1),
('L1 Support', 'Support', 1),
('L2 Support', 'Support', 1),
('L3 Support', 'Support', 1)
ON DUPLICATE KEY UPDATE role_category = VALUES(role_category), active_flag = VALUES(active_flag);

INSERT INTO md_skill (skill_name, skill_category, active_flag) VALUES
('Java', 'Languages', 1),
('Python', 'Languages', 1),
('JavaScript', 'Languages', 1),
('TypeScript', 'Languages', 1),
('SQL', 'Languages', 1),
('React', 'Frontend', 1),
('Angular', 'Frontend', 1),
('Vue', 'Frontend', 1),
('Spring Boot', 'Backend', 1),
('Django', 'Backend', 1),
('FastAPI', 'Backend', 1),
('Node.js', 'Backend', 1),
('AWS', 'Cloud', 1),
('Azure', 'Cloud', 1),
('GCP', 'Cloud', 1),
('Docker', 'DevOps', 1),
('Kubernetes', 'DevOps', 1),
('Jenkins', 'DevOps', 1),
('Terraform', 'DevOps', 1),
('Spark', 'Data', 1),
('Kafka', 'Data', 1),
('Airflow', 'Data', 1),
('Power BI', 'Data', 1),
('Selenium', 'Testing', 1),
('Cypress', 'Testing', 1),
('JMeter', 'Testing', 1),
('SAP', 'ERP', 1),
('Salesforce', 'ERP', 1)
ON DUPLICATE KEY UPDATE skill_category = VALUES(skill_category), active_flag = VALUES(active_flag);

INSERT INTO md_industry (industry_code, industry_name, is_active) VALUES
('BFSI', 'Banking, Financial Services and Insurance', 1),
('HEALTHCARE', 'Healthcare', 1),
('RETAIL', 'Retail', 1),
('TELECOM', 'Telecom', 1),
('MANUFACTURING', 'Manufacturing', 1),
('ENERGY_UTILITIES', 'Energy and Utilities', 1),
('PUBLIC_SECTOR', 'Public Sector', 1),
('TECHNOLOGY', 'Technology', 1),
('MEDIA_ENTERTAINMENT', 'Media and Entertainment', 1),
('TRANSPORTATION_LOGISTICS', 'Transportation and Logistics', 1)
ON DUPLICATE KEY UPDATE industry_name = VALUES(industry_name), is_active = VALUES(is_active);

INSERT INTO md_rate_card (role_id, location_type, rate_per_day, currency, effective_from, active_flag)
SELECT role_id, 'ONSITE',
  CASE role_category
    WHEN 'Management' THEN 1200
    WHEN 'Architecture' THEN 1300
    WHEN 'Backend' THEN 1000
    WHEN 'Python' THEN 1000
    WHEN 'Frontend' THEN 900
    WHEN 'Data' THEN 1050
    WHEN 'Testing' THEN 750
    WHEN 'DevOps' THEN 950
    WHEN 'ERP' THEN 1100
    WHEN 'Support' THEN 500
    ELSE 800
  END,
  'USD', '2026-01-01', 1
FROM md_role
ON DUPLICATE KEY UPDATE rate_per_day = VALUES(rate_per_day), active_flag = VALUES(active_flag);

INSERT INTO md_rate_card (role_id, location_type, rate_per_day, currency, effective_from, active_flag)
SELECT role_id, 'OFFSHORE',
  CASE role_category
    WHEN 'Management' THEN 600
    WHEN 'Architecture' THEN 650
    WHEN 'Backend' THEN 500
    WHEN 'Python' THEN 500
    WHEN 'Frontend' THEN 450
    WHEN 'Data' THEN 525
    WHEN 'Testing' THEN 375
    WHEN 'DevOps' THEN 475
    WHEN 'ERP' THEN 550
    WHEN 'Support' THEN 250
    ELSE 400
  END,
  'USD', '2026-01-01', 1
FROM md_role
ON DUPLICATE KEY UPDATE rate_per_day = VALUES(rate_per_day), active_flag = VALUES(active_flag);
