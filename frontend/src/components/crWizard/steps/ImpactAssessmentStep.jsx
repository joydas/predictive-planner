import React, { useMemo } from 'react';
import { CButton, CCol, CFormInput, CFormSelect, CFormTextarea, CRow, CSpinner } from '@coreui/react';
import { deriveResourcePlanning, formatCurrency, getRateForRole, parseNumber } from '../../../utils/resourcePlanning';
import { formatApiDate, formatDisplayDate } from '../../../utils/dateUtils';

const locationOptions = ['ONSITE', 'OFFSHORE'];

const formatNumber = (value) => parseNumber(value, 0).toFixed(2);
const rowKey = (prefix, row, index) => row.key || `${prefix}-${index}`;

const getBaselineKey = (row, index) => rowKey('baseline', row, index);

const ImpactAssessmentStep = ({
  data,
  selectedProject,
  teamImpact,
  financial,
  updateSection,
  updateTeamImpact,
  updateFinancial,
  masterData,
  loadingStaffing,
  errors,
}) => {
  const rateCards = useMemo(
    () => masterData.rateCards || financial.rateCards || [],
    [financial.rateCards, masterData.rateCards],
  );
  const roleOptions = useMemo(() => {
    const roles = (masterData.roles || []).map((role) => ({
      roleId: role.roleId != null ? String(role.roleId) : '',
      roleName: role.roleName,
    })).filter((role) => role.roleId && role.roleName);

    if (roles.length) return roles;

    return Object.values((rateCards || []).reduce((acc, card) => {
      const roleId = card.roleId != null ? String(card.roleId) : '';
      if (roleId && card.roleName && !acc[roleId]) {
        acc[roleId] = { roleId, roleName: card.roleName };
      }
      return acc;
    }, {}));
  }, [masterData.roles, rateCards]);

  const baselineRows = useMemo(
    () => teamImpact.staffingBaselineSnapshot || [],
    [teamImpact.staffingBaselineSnapshot],
  );
  const deltaRows = useMemo(
    () => teamImpact.staffingDeltas || [],
    [teamImpact.staffingDeltas],
  );
  const baselineByKey = useMemo(() => (
    baselineRows.reduce((acc, row, index) => ({
      ...acc,
      [getBaselineKey(row, index)]: row,
    }), {})
  ), [baselineRows]);

  const normalizeDeltaRows = (rows) => rows.map((row, index) => {
    const baseline = row.baselineKey ? baselineByKey[row.baselineKey] : null;
    const isAdjust = row.changeType === 'ADJUST' && baseline;
    const targetRow = {
      ...row,
      count: parseNumber(row.targetCount ?? row.count, 0),
      allocationPercent: parseNumber(row.targetAllocationPercent ?? row.allocationPercent, 0),
      startDate: row.targetStartDate || row.startDate || '',
      endDate: row.targetEndDate || row.endDate || '',
    };
    const plannedTarget = deriveResourcePlanning({ rows: [targetRow], financial, rateCards }).rows[0] || targetRow;
    const baselineEffort = isAdjust ? parseNumber(baseline.plannedEffort, 0) : 0;
    const baselineCost = isAdjust ? parseNumber(baseline.plannedCost, 0) : 0;
    const baselineCount = isAdjust ? parseNumber(baseline.count, 0) : 0;

    return {
      ...row,
      key: row.key || `cr-delta-${Date.now()}-${index}`,
      baselineKey: row.baselineKey || null,
      changeType: row.changeType || 'ADD',
      targetCount: targetRow.count,
      targetAllocationPercent: targetRow.allocationPercent,
      targetStartDate: targetRow.startDate,
      targetEndDate: targetRow.endDate,
      count: targetRow.count - baselineCount,
      allocationPercent: isAdjust
        ? targetRow.allocationPercent - parseNumber(baseline.allocationPercent, 0)
        : targetRow.allocationPercent,
      startDate: targetRow.startDate,
      endDate: targetRow.endDate,
      durationDays: parseNumber(plannedTarget.durationDays, 0) - (isAdjust ? parseNumber(baseline.durationDays, 0) : 0),
      ratePerDay: parseNumber(plannedTarget.ratePerDay || row.ratePerDay, 0),
      plannedEffort: parseNumber(plannedTarget.plannedEffort, 0) - baselineEffort,
      plannedCost: parseNumber(plannedTarget.plannedCost, 0) - baselineCost,
    };
  });

  const plannedDisplayRows = useMemo(() => (
    deltaRows.map((row) => {
      const targetRow = {
        ...row,
        count: parseNumber(row.targetCount ?? row.count, 0),
        allocationPercent: parseNumber(row.targetAllocationPercent ?? row.allocationPercent, 0),
        startDate: row.targetStartDate || row.startDate || '',
        endDate: row.targetEndDate || row.endDate || '',
      };
      return deriveResourcePlanning({ rows: [targetRow], financial, rateCards }).rows[0] || targetRow;
    })
  ), [deltaRows, financial, rateCards]);

  const updateDeltaRows = (rows) => {
    const plannedRows = normalizeDeltaRows(rows);
    const plannedSummary = plannedRows.reduce((totals, row) => ({
      effort: totals.effort + parseNumber(row.plannedEffort, 0),
      cost: totals.cost + parseNumber(row.plannedCost, 0),
      teamSize: totals.teamSize + parseNumber(row.count, 0),
    }), { effort: 0, cost: 0, teamSize: 0 });
    updateTeamImpact({ staffingDeltas: plannedRows });
    updateSection({ estimatedEffortHours: formatNumber(plannedSummary.effort) });
    updateFinancial({ additionalBudget: formatNumber(plannedSummary.cost) });
  };

  const updateDeltaRow = (index, field, value) => {
    const rows = deltaRows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const targetFieldMap = {
        count: 'targetCount',
        allocationPercent: 'targetAllocationPercent',
        startDate: 'targetStartDate',
        endDate: 'targetEndDate',
      };
      const next = { ...row, [targetFieldMap[field] || field]: value };
      if (field === 'roleId') {
        const selectedRole = roleOptions.find((role) => String(role.roleId) === String(value));
        next.role = selectedRole?.roleName || '';
        next.ratePerDay = getRateForRole(value, next.locationType || 'ONSITE', rateCards);
      }
      if (field === 'locationType') {
        next.ratePerDay = getRateForRole(next.roleId, value, rateCards);
      }
      return next;
    });
    updateDeltaRows(rows);
  };

  const addDeltaRow = (sourceRow = null, changeType = 'ADJUST') => {
    const fallbackRole = roleOptions[0] || {};
    const sourceIndex = sourceRow ? baselineRows.indexOf(sourceRow) : -1;
    const roleId = sourceRow?.roleId || fallbackRole.roleId || '';
    const locationType = sourceRow?.locationType || 'ONSITE';
    updateDeltaRows([
      ...deltaRows,
      {
        key: `cr-delta-${Date.now()}`,
        baselineKey: sourceRow ? getBaselineKey(sourceRow, sourceIndex) : null,
        changeType,
        roleId,
        role: sourceRow?.role || fallbackRole.roleName || '',
        locationType,
        targetCount: parseNumber(sourceRow?.count, 1),
        targetAllocationPercent: parseNumber(sourceRow?.allocationPercent, 100),
        targetStartDate: formatApiDate(sourceRow?.startDate) || '',
        targetEndDate: formatApiDate(sourceRow?.endDate) || '',
        count: sourceRow ? 0 : 1,
        allocationPercent: sourceRow ? 0 : 100,
        startDate: formatApiDate(sourceRow?.startDate) || '',
        endDate: formatApiDate(sourceRow?.endDate) || '',
        ratePerDay: getRateForRole(roleId, locationType, rateCards) || sourceRow?.ratePerDay || '',
      },
    ]);
  };

  const removeDeltaRow = (index) => {
    updateDeltaRows(deltaRows.filter((_, rowIndex) => rowIndex !== index));
  };

  const summary = deltaRows.reduce((totals, row) => ({
    effort: totals.effort + parseNumber(row.plannedEffort, 0),
    cost: totals.cost + parseNumber(row.plannedCost, 0),
    teamSize: totals.teamSize + parseNumber(row.count, 0),
  }), { effort: 0, cost: 0, teamSize: 0 });

  const currentApprovedValues = selectedProject?.currentApprovedValues || {};
  const impactPreview = [
    {
      metric: 'Effort',
      current: parseNumber(currentApprovedValues.effort, 0),
      delta: parseNumber(data.estimatedEffortHours, 0),
      formatter: (value) => `${formatNumber(value)} PD`,
    },
    {
      metric: 'Budget',
      current: parseNumber(currentApprovedValues.budget, 0),
      delta: parseNumber(financial.additionalBudget, 0),
      formatter: formatCurrency,
    },
    {
      metric: 'Team Size',
      current: parseNumber(currentApprovedValues.teamSize, 0),
      delta: parseNumber(summary.teamSize, 0),
      formatter: formatNumber,
    },
    {
      metric: 'Duration',
      current: parseNumber(currentApprovedValues.duration, 0),
      delta: parseNumber(data.scheduleImpactDays, 0),
      formatter: (value) => `${formatNumber(value)} days`,
    },
    {
      metric: 'Estimation',
      current: parseNumber(currentApprovedValues.estimation, 0),
      delta: parseNumber(data.estimatedEffortHours, 0),
      formatter: (value) => `${formatNumber(value)} PD`,
    },
  ];

  return (
    <div className="wizard-step-panel">
      <h3>Impact Assessment</h3>
      <CRow className="g-3">
        <CCol md={3}>
          <label className="form-label">Schedule Impact Days</label>
          <CFormInput type="number" min="0" value={data.scheduleImpactDays} onChange={(event) => updateSection({ scheduleImpactDays: event.target.value })} />
        </CCol>
        <CCol md={3}>
          <label className="form-label">Estimated Effort (PD)</label>
          <CFormInput type="number" value={data.estimatedEffortHours} onChange={(event) => updateSection({ estimatedEffortHours: event.target.value })} />
        </CCol>
        <CCol md={3}>
          <label className="form-label">Budget Impact</label>
          <CFormInput type="number" value={financial.additionalBudget} onChange={(event) => updateFinancial({ additionalBudget: event.target.value })} />
        </CCol>
        <CCol md={3}>
          <label className="form-label">Net Team Impact</label>
          <CFormInput type="number" value={formatNumber(summary.teamSize)} readOnly />
        </CCol>
      </CRow>

      <div className="cr-staffing-section">
        <div className="cr-staffing-section-header">
          <div>
            <h4>Current Approved Staffing</h4>
            <span>Read-only staffing baseline for this CR.</span>
          </div>
          {loadingStaffing && <span className="cr-inline-loading"><CSpinner size="sm" /> Loading</span>}
        </div>
        <div className="cr-staffing-grid cr-staffing-grid-readonly">
          <div className="cr-staffing-row cr-staffing-header">
            <div>Role</div>
            <div>Location type</div>
            <div>Count</div>
            <div>Allocation %</div>
            <div>Duration</div>
            <div>Effort (PD)</div>
            <div>Cost</div>
            <div />
          </div>
          {baselineRows.length === 0 && (
            <div className="cr-staffing-empty">No approved staffing rows are available for this project.</div>
          )}
          {baselineRows.map((row, index) => (
            <div key={rowKey('baseline', row, index)} className="cr-staffing-row">
              <div className="derived-cell">{row.role || '-'}</div>
              <div className="derived-cell">{row.locationType || '-'}</div>
              <div className="derived-cell">{formatNumber(row.count)}</div>
              <div className="derived-cell">{formatNumber(row.allocationPercent)}%</div>
              <div className="derived-cell">{formatDisplayDate(row.startDate)} to {formatDisplayDate(row.endDate)}</div>
              <div className="derived-cell">{formatNumber(row.plannedEffort)}</div>
              <div className="derived-cell">{formatCurrency(row.plannedCost)}</div>
              <CButton color="warning" size="sm" onClick={() => addDeltaRow(row, 'ADJUST')}>Change</CButton>
            </div>
          ))}
        </div>
      </div>

      <div className="cr-staffing-section">
        <div className="cr-staffing-section-header">
          <div>
            <h4>CR Staffing Changes</h4>
            <span>Delta rows stay isolated until the CR is approved.</span>
          </div>
          <CButton color="primary" size="sm" onClick={() => addDeltaRow(null, 'ADD')}>Add Role</CButton>
        </div>
        <div className="cr-delta-summary-grid">
          <div><strong>Net effort</strong><span>{formatNumber(summary.effort)} PD</span></div>
          <div><strong>Net cost</strong><span>{formatCurrency(summary.cost)}</span></div>
          <div><strong>Net resources</strong><span>{formatNumber(summary.teamSize)}</span></div>
        </div>
        <div className="cr-staffing-grid">
          <div className="cr-staffing-row cr-staffing-row-editable cr-staffing-header">
            <div>Role</div>
            <div>Location type</div>
            <div>Count</div>
            <div>Allocation %</div>
            <div>Start</div>
            <div>End</div>
            <div>Rate</div>
            <div>Effort (PD)</div>
            <div>Cost</div>
            <div />
          </div>
          {deltaRows.length === 0 && (
            <div className="cr-staffing-empty">Add a staffing delta or select Change from the approved staffing snapshot.</div>
          )}
          {deltaRows.map((row, index) => {
            const plannedRow = plannedDisplayRows[index] || row;
            return (
              <div key={rowKey('delta', row, index)} className="cr-staffing-row cr-staffing-row-editable">
                <input type="hidden" value={row.changeType || 'ADD'} readOnly />
                <CFormSelect value={row.roleId != null ? String(row.roleId) : ''} onChange={(event) => updateDeltaRow(index, 'roleId', event.target.value)}>
                  <option value="">Select role</option>
                  {roleOptions.map((role) => <option key={role.roleId} value={role.roleId}>{role.roleName}</option>)}
                </CFormSelect>
                <CFormSelect value={row.locationType || 'ONSITE'} onChange={(event) => updateDeltaRow(index, 'locationType', event.target.value)}>
                  {locationOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </CFormSelect>
                <CFormInput type="number" step="0.1" value={row.targetCount ?? row.count} onChange={(event) => updateDeltaRow(index, 'count', event.target.value)} />
                <CFormInput type="number" step="0.1" value={row.targetAllocationPercent ?? row.allocationPercent} onChange={(event) => updateDeltaRow(index, 'allocationPercent', event.target.value)} />
                <CFormInput type="date" value={row.targetStartDate || row.startDate || ''} onChange={(event) => updateDeltaRow(index, 'startDate', event.target.value)} />
                <CFormInput type="date" value={row.targetEndDate || row.endDate || ''} onChange={(event) => updateDeltaRow(index, 'endDate', event.target.value)} />
                <div className="derived-cell">{formatCurrency(plannedRow.ratePerDay || row.ratePerDay || 0)}</div>
                <div className="derived-cell">{formatNumber(plannedRow.plannedEffort)}</div>
                <div className="derived-cell">{formatCurrency(plannedRow.plannedCost)}</div>
                <CButton color="danger" variant="outline" size="sm" onClick={() => removeDeltaRow(index)}>Remove</CButton>
              </div>
            );
          })}
        </div>
      </div>

      <CRow className="g-3 mt-1">
        <CCol md={6}>
          <label className="form-label">Dependency Impact</label>
          <CFormTextarea rows={4} value={data.dependencyImpact} onChange={(event) => updateSection({ dependencyImpact: event.target.value })} />
        </CCol>
        <CCol md={6}>
          <label className="form-label">Environments Affected</label>
          <CFormTextarea rows={4} value={data.environmentsAffected} onChange={(event) => updateSection({ environmentsAffected: event.target.value })} />
          {errors.environmentsAffected && <div className="form-error">{errors.environmentsAffected}</div>}
        </CCol>
      </CRow>

      <div className="cr-staffing-section">
        <div className="cr-staffing-section-header">
          <div>
            <h4>CR Impact Preview</h4>
            <span>Current approved values, proposed values, and approval deltas.</span>
          </div>
        </div>
        <div className="cr-impact-preview-grid">
          <div className="cr-impact-preview-row cr-impact-preview-header">
            <div>Metric</div>
            <div>Current Approved</div>
            <div>Proposed</div>
            <div>Impact Delta</div>
          </div>
          {impactPreview.map((row) => (
            <div className="cr-impact-preview-row" key={row.metric}>
              <div>{row.metric}</div>
              <div>{row.formatter(row.current)}</div>
              <div>{row.formatter(row.current + row.delta)}</div>
              <div>{row.formatter(row.delta)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ImpactAssessmentStep;
