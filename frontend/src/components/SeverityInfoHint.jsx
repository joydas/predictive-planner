import React from 'react';
import { CTooltip } from '@coreui/react';

export const PROJECT_SEVERITY_TITLE = 'Project Severity';

export const PROJECT_SEVERITY_TEXT = `Based on:

Expected Completion %
vs
Actual Completion %

Not Measured
No progress reported

Normal
On track

Medium
Early deviation

High
Management attention required

Urgent
Immediate intervention required`;

const SeverityInfoHint = () => {
  const label = `${PROJECT_SEVERITY_TITLE}\n\n${PROJECT_SEVERITY_TEXT}`;
  return (
    <CTooltip
      content={(
        <div className="analytics-info-tooltip">
          <div className="analytics-info-tooltip-title">{PROJECT_SEVERITY_TITLE}</div>
          <div className="analytics-info-tooltip-body">{PROJECT_SEVERITY_TEXT}</div>
        </div>
      )}
      placement="top"
    >
      <span className="analytics-info-hint" aria-label={label} role="img" tabIndex={0}>i</span>
    </CTooltip>
  );
};

export default SeverityInfoHint;
