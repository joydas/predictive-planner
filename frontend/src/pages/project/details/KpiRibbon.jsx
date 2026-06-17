import React from 'react';
import { CBadge } from '@coreui/react';

const statusColors = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  RETURNED: 'warning',
  APPROVED: 'success',
  ACTIVE: 'primary',
  COMPLETE: 'dark',
  COMPLETED: 'dark',
  REJECTED: 'danger',
};

const KpiChip = ({ label, value, badgeColor }) => (
  <div className="kpi-chip">
    <span className="kpi-label">{label}</span>
    <span className="kpi-value">
      {badgeColor ? (
        <CBadge color={badgeColor}>{value}</CBadge>
      ) : (
        value
      )}
    </span>
  </div>
);

const KpiRibbon = ({ 
  projectName, 
  status, 
  technology, 
  budget, 
  effort, 
  teamSize, 
  completion, 
  forecastStatus,
  forecastStatusColor 
}) => {
  return (
    <div className="kpi-ribbon">
      <KpiChip label="Project" value={projectName} />
      <KpiChip label="Status" value={status} badgeColor={statusColors[status] || 'secondary'} />
      <KpiChip label="Technology" value={technology} />
      <KpiChip label="Budget" value={budget} />
      <KpiChip label="Effort" value={effort} />
      <KpiChip label="Team Size" value={teamSize} />
      <KpiChip label="Completion" value={completion} />
      <KpiChip 
        label="Forecast" 
        value={forecastStatus} 
        badgeColor={forecastStatusColor} 
      />
    </div>
  );
};

export default KpiRibbon;
