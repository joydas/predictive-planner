# Regression Suite Refinement

## Objective

The regression suite should generate realistic, persistent TEST DATA that can be used to validate dashboards, analytics, forecasting, explainability, and ML workflows without polluting genuine business history.

Regression-generated records must remain available after execution. Cleanup must happen only through Administration -> Data Management or a future Delete Regression Data capability.

## Core Rules

- Project Type must be `TEST DATA`.
- Generated projects must be marked with `is_regression_data = 1`.
- Generated project drafts must be marked with `is_regression_data = 1` where draft records are created.
- Do not auto-delete generated records after the suite completes.
- Do not use GUID-style or technical names for generated business records.
- Generated data must be realistic enough for dashboard, forecasting, analytics, and ML validation.
- Future ML training, forecasting datasets, analytics experiments, and recommendation searches must be able to exclude these records using `is_regression_data = 1`.

## Naming

Projects:

- `Test Project-1`
- `Test Project-2`
- `Test Project-3`

Change Requests:

- `Test CR-1`
- `Test CR-2`
- `Test CR-3`

Names should be sequential and easy to locate in list pages and dashboards.

## Project Generation

Project duration must be randomized between 3 and 12 months.

Allowed industries:

- Banking
- Insurance
- Retail
- Healthcare
- Telecom

Allowed technologies:

- Java
- .NET
- Python
- Cloud
- Data Engineering

Allowed complexity values:

- Low
- Medium
- High

Effort, budget, and team size must be correlated with duration and complexity. Avoid extreme or internally inconsistent combinations.

Suggested ranges:

| Duration | Effort Range | Team Size Range |
| --- | ---: | ---: |
| 3-4 months | 50-180 PD | 2-5 |
| 5-7 months | 150-350 PD | 4-8 |
| 8-10 months | 300-650 PD | 6-12 |
| 11-12 months | 500-900 PD | 8-15 |

Budget should be derived from realistic effort and blended-rate assumptions, with modest variance by technology and complexity. Example outputs should resemble `5L`, `12L`, `25L`, and `60L`, not unrealistic project/budget combinations.

## Change Request Generation

Generate 0-3 CRs per project.

Each CR must include:

- realistic effort impact
- realistic budget impact
- optional duration impact
- name using `Test CR-n`
- link to its generated test project

CR impacts should remain proportional to the base project size. A typical CR should affect 3-15% of planned effort or budget, with occasional 0-30 day schedule impact.

## Progress Snapshot Generation

Generate believable month-by-month progress snapshots.

Progress should:

- increase over time
- avoid 100% completion immediately
- avoid random large jumps
- reflect mild delivery variance

Example:

| Month | Completion |
| --- | ---: |
| Month 1 | 12% |
| Month 2 | 28% |
| Month 3 | 46% |
| Month 4 | 71% |

Completed test projects should end at 100%. Active test projects should stop at a realistic current completion value based on elapsed duration.

## Completion Data

Completed generated projects must include:

- actual final effort
- actual final budget
- actual completion date

Actuals should include realistic variance from plan.

Examples:

| Planned | Actual |
| --- | --- |
| 500 PD | 540 PD |
| 50L | 54L |

Recommended variance:

- effort: -10% to +20%
- budget: -10% to +20%
- completion date: -15 to +45 days

Avoid extreme values that make analytics or model validation misleading.

## Persistence And Cleanup

Regression suite execution must not delete generated records.

Deletion is allowed only through:

- Administration -> Data Management
- future Delete Regression Data feature

This allows generated TEST DATA to remain visible for manual validation across:

- operational dashboards
- analytics dashboards
- forecasting panels
- similar-project search
- explainable AI screens
- ML experimentation

## Execution Summary

At completion, show a run summary:

```text
Projects Created: 10
CRs Created: 15
Snapshots Created: 48
Completed Projects: 6
Duration: 1m 42s
```

The summary must include:

- projects created
- CRs created
- progress snapshots created
- completed projects created
- execution duration

## Safety Acceptance Criteria

- Every generated project uses Project Type `TEST DATA`.
- Every generated project row has `is_regression_data = 1`.
- Every generated draft row has `is_regression_data = 1` where applicable.
- No generated data is auto-deleted.
- Generated project and CR names are human-readable.
- Project duration is always 3-12 months.
- Effort, budget, and team size are correlated.
- Progress snapshots are chronologically believable.
- Completed projects contain realistic actual effort, actual budget, and actual completion date.
- Future ML pipelines can exclude generated records using `is_regression_data = 1`.
