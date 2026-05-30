import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAlert, CButton, CFormInput, CFormSelect, CFormTextarea, CSpinner } from '@coreui/react';
import { getMlRecommendation } from '../../../services/projectService';
import { deriveResourcePlanning, formatCurrency, getRateForRole } from '../../../utils/resourcePlanning';
import DateDisplayInput from '../DateDisplayInput';

const allocationOptions = [25, 50, 75, 100];
const locationOptions = ['ONSITE', 'OFFSHORE'];
const roleAliases = {
  PM: 'Project Manager',
  BA: 'Business Analyst',
  QA: 'QA Lead',
  Dev: 'Java Developer',
  Developer: 'Java Developer',
};

const displayRole = (role) => String(role || '').replace(/_/g, ' ');

const calculateVariancePercent = (baseline, comparison) => {
  const baselineValue = Number(baseline);
  const comparisonValue = Number(comparison);
  if (!Number.isFinite(baselineValue) || baselineValue === 0 || !Number.isFinite(comparisonValue)) {
    return null;
  }
  return Number((((comparisonValue - baselineValue) / baselineValue) * 100).toFixed(2));
};

const varianceSeverity = (variance) => {
  if (variance === null || variance === undefined) return 'Pending';
  const absolute = Math.abs(Number(variance));
  if (absolute <= 10) return 'Normal';
  if (absolute <= 20) return 'Medium';
  if (absolute <= 40) return 'High';
  return 'Critical';
};

const formatPd = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)} PD` : '-';
};

const formatVariance = (value) => (
  value === null || value === undefined
    ? '-'
    : `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(2)}%`
);

const normalizeRoleLabel = (label) =>
  String(label || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const TeamCompositionStep = ({
  data,
  deliveryDetails,
  financial,
  masterData,
  mlRecommendation,
  projectData,
  updateMlRecommendation,
  setTeamRows,
  errors,
}) => {
  const [recommendationError, setRecommendationError] = useState('');
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const rateCards = useMemo(
    () => masterData.rateCards || financial.rateCards || [],
    [financial.rateCards, masterData.rateCards],
  );
  const roleOptions = useMemo(() => {
    const roles = (masterData.roles || []).map((role) => ({
      ...role,
      roleId: role.roleId != null ? String(role.roleId) : '',
    })).filter((role) => role.roleId && role.roleName);

    if (roles.length) {
      return roles;
    }

    return Object.values(rateCards.reduce((acc, card) => {
        const cardRoleId = card.roleId != null ? String(card.roleId) : '';
        if (cardRoleId && card.roleName && !acc[cardRoleId]) {
          acc[cardRoleId] = {
            roleId: cardRoleId,
            roleName: card.roleName,
          };
        }
        return acc;
      }, {}));
  }, [masterData.roles, rateCards]);
  const derived = deriveResourcePlanning({ rows: data.rows, financial, rateCards });
  const seededEmptyDraftRowRef = useRef(false);

  const resolveRole = useCallback((roleId) => {
    const id = roleId != null ? String(roleId) : '';
    return roleOptions.find((role) => String(role.roleId) === id);
  }, [roleOptions]);
  const resolveRate = useCallback(
    (roleId, locationType) => getRateForRole(roleId, locationType, rateCards),
    [rateCards],
  );

  const findRoleOption = useCallback((roleLabel) => {
    const normalized = normalizeRoleLabel(roleLabel);
    const directMatch = roleOptions.find((role) => normalizeRoleLabel(role.roleName) === normalized);
    if (directMatch) {
      return directMatch;
    }

    const aliasMatch = Object.entries(roleAliases).find(
      ([alias]) => normalizeRoleLabel(alias) === normalized,
    );
    if (aliasMatch) {
      return roleOptions.find(
        (role) => normalizeRoleLabel(role.roleName) === normalizeRoleLabel(aliasMatch[1]),
      );
    }

    return null;
  }, [roleOptions]);

  useEffect(() => {
    if (!roleOptions.length || !data.rows.length) {
      return;
    }

    const normalizedRows = data.rows.map((row) => {
      const currentRoleId = row.roleId || '';
      const currentRole = row.role || '';
      const matchedRole = currentRoleId
        ? resolveRole(currentRoleId)
        : findRoleOption(currentRole);

      if (!matchedRole) {
        return {
          ...row,
          roleId: currentRoleId != null ? String(currentRoleId) : '',
        };
      }

      const matchedRoleId = String(matchedRole.roleId);

      return {
        ...row,
        roleId: matchedRoleId,
        role: currentRole || matchedRole.roleName,
        ratePerDay: row.ratePerDay || resolveRate(matchedRoleId, row.locationType || 'ONSITE'),
      };
    });

    const rowsChanged = JSON.stringify(normalizedRows) !== JSON.stringify(data.rows);
    if (rowsChanged) {
      setTeamRows(normalizedRows);
    }
  }, [data.rows, findRoleOption, resolveRate, resolveRole, roleOptions.length, setTeamRows]);

  const withProjectDates = (row) => ({
    ...row,
    startDate: row.startDate || deliveryDetails.start_date || '',
    endDate: row.endDate || deliveryDetails.planned_end_date || '',
  });

  useEffect(() => {
    if (seededEmptyDraftRowRef.current || data.rows.length) {
      return;
    }

    seededEmptyDraftRowRef.current = true;
    setTeamRows([{
      roleId: '',
      role: '',
      locationType: 'ONSITE',
      count: 1,
      allocationPercent: 100,
      startDate: deliveryDetails.start_date || '',
      endDate: deliveryDetails.planned_end_date || '',
      ratePerDay: '',
    }]);
  }, [data.rows.length, deliveryDetails.planned_end_date, deliveryDetails.start_date, setTeamRows]);

  const updateRow = (index, field, value) => {
    const updatedRows = data.rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = withProjectDates({ ...row, [field]: value });

      if (field === 'roleId') {
        const selectedRole = resolveRole(value);
        next.role = selectedRole?.roleName || '';
        next.ratePerDay = resolveRate(value, next.locationType);
      }

      if (field === 'locationType') {
        next.ratePerDay = resolveRate(next.roleId, value);
      }

      return next;
    });
    setTeamRows(updatedRows);
  };

  const addRow = () => {
    const fallbackRole = roleOptions[0] || {};
    const locationType = 'ONSITE';
    setTeamRows([
      ...data.rows,
      {
        roleId: fallbackRole.roleId || '',
        role: fallbackRole.roleName || '',
        locationType,
        count: 1,
        allocationPercent: 100,
        startDate: deliveryDetails.start_date || '',
        endDate: deliveryDetails.planned_end_date || '',
        ratePerDay: fallbackRole.roleId ? resolveRate(fallbackRole.roleId, locationType) : '',
      },
    ]);
  };

  const removeRow = (index) => {
    setTeamRows(data.rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const buildRecommendedRows = (recommendedTeam) => (
    Object.entries(recommendedTeam || {})
      .filter(([, count]) => Number(count) > 0)
      .map(([roleName, count]) => {
        const normalizedRole = roleAliases[roleName] || roleAliases[displayRole(roleName)] || displayRole(roleName);
        const selectedRole = roleOptions.find((role) => role.roleName === normalizedRole)
          || roleOptions.find((role) => role.roleName.toLowerCase() === normalizedRole.toLowerCase())
          || {};
        const locationType = 'OFFSHORE';
        return {
          roleId: selectedRole.roleId || '',
          role: selectedRole.roleName || normalizedRole,
          locationType,
          count,
          allocationPercent: 100,
          startDate: deliveryDetails.start_date || '',
          endDate: deliveryDetails.planned_end_date || '',
          ratePerDay: selectedRole.roleId ? resolveRate(selectedRole.roleId, locationType) : '',
        };
      })
  );

  const handleGetRecommendation = async () => {
    setLoadingRecommendation(true);
    setRecommendationError('');
    try {
      const result = await getMlRecommendation(projectData);
      const recommendedRows = buildRecommendedRows(result.staffing?.recommendedTeam);
      const recommendedPlanning = deriveResourcePlanning({
        rows: recommendedRows,
        financial,
        rateCards,
      });
      const recommendedEffort = Number(recommendedPlanning.planned_effort || 0);
      const aiEffort = recommendedRows.length
        ? recommendedEffort
        : Number(result.effort?.predictedHours ?? 0);
      const aiEstimatedValue = Number(result.estimation?.recommendedValue ?? result.effort?.predictedHours ?? 0);
      updateMlRecommendation({
        recommendation: {
          ...result,
          estimation: {
            ...(result.estimation || {}),
            recommendedValue: Number(aiEstimatedValue.toFixed(2)),
          },
          baselineSnapshot: {
            effort: Number(aiEffort.toFixed(2)),
            budget: Number(recommendedPlanning.budget.toFixed(2)),
            teamSize: Number(recommendedPlanning.estimated_team_size.toFixed(2)),
          },
        },
        acceptedAt: new Date().toISOString(),
      });
      if (recommendedRows.length) {
        setTeamRows(recommendedRows);
      }
    } catch (error) {
      setRecommendationError(error.message || 'Unable to get ML recommendation');
    } finally {
      setLoadingRecommendation(false);
    }
  };

  const recommendation = mlRecommendation.recommendation;
  const pmEstimatedValue = Number(projectData?.basicInfo?.pm_estimated_value || 0);
  const aiEstimatedValue = Number(recommendation?.estimation?.recommendedValue || 0);
  const currentPlannedEffort = Number(derived.planned_effort || 0);
  const pmVsMlVariance = recommendation
    ? calculateVariancePercent(pmEstimatedValue, aiEstimatedValue)
    : null;
  const pmVsPlannedVariance = recommendation
    ? calculateVariancePercent(pmEstimatedValue, currentPlannedEffort)
    : null;
  const mlVsPlannedVariance = recommendation
    ? calculateVariancePercent(aiEstimatedValue, currentPlannedEffort)
    : null;

  return (
    <div className="wizard-step-panel">
      <div className="team-composition-title-row">
        <h3>Resource Loading and Planning</h3>
        <CButton color="primary" onClick={handleGetRecommendation} disabled={loadingRecommendation}>
          {loadingRecommendation ? <><CSpinner size="sm" /> Getting Recommendation</> : 'Get ML Recommendation'}
        </CButton>
      </div>

      {recommendationError && <CAlert color="danger">{recommendationError}</CAlert>}
      {recommendation && (
        <CAlert color="info" className="ml-recommendation-panel">
          <div className="ml-recommendation-grid">
            <div>
              <strong>ML Recommended Staffing</strong>
              <div className="ml-recommendation-team">
                {Object.entries(recommendation.staffing?.recommendedTeam || {}).map(([role, count]) => (
                  <span key={role}>{displayRole(role)}: {count}</span>
                ))}
              </div>
            </div>
            <div>
              <strong>ML Predicted Risk</strong>
              <div>{recommendation.risk?.riskLevel || 'Unknown'}</div>
            </div>
          </div>
          <div className="ml-recommendation-grid mt-3">
            <div>
              <strong>PM Estimate</strong>
              <div>{formatPd(pmEstimatedValue)}</div>
            </div>
            <div>
              <strong>ML Estimate</strong>
              <div>{formatPd(aiEstimatedValue)}</div>
            </div>
            <div>
              <strong>Planned Effort</strong>
              <div>{formatPd(currentPlannedEffort)}</div>
            </div>
            <div>
              <strong>PM vs ML</strong>
              <div>{formatVariance(pmVsMlVariance)} - {varianceSeverity(pmVsMlVariance)}</div>
            </div>
            <div>
              <strong>PM vs Planned</strong>
              <div>{formatVariance(pmVsPlannedVariance)} - {varianceSeverity(pmVsPlannedVariance)}</div>
            </div>
            <div>
              <strong>ML vs Planned</strong>
              <div>{formatVariance(mlVsPlannedVariance)} - {varianceSeverity(mlVsPlannedVariance)}</div>
            </div>
          </div>
        </CAlert>
      )}

      <div className="team-composition-grid">
        <div className="resource-loading-row resource-loading-header">
          <div>Role</div>
          <div>Location Type</div>
          <div>Count</div>
          <div>Allocation %</div>
          <div>Start</div>
          <div>End</div>
          <div>Rate</div>
          <div>Effort (PD)</div>
          <div>Cost</div>
          <div />
        </div>
        {data.rows.map((row, index) => {
          const plannedRow = derived.rows[index] || row;
          const rowWithDates = withProjectDates(row);
          return (
            <div key={index} className="resource-loading-row">
              <CFormSelect
                value={row.roleId != null ? String(row.roleId) : ''}
                onChange={(event) => updateRow(index, 'roleId', event.target.value)}
                invalid={!!errors[`role_${index}`]}
              >
                <option value="">Select role</option>
                {roleOptions.map((role) => (
                  <option key={role.roleId} value={String(role.roleId)}>{role.roleName}</option>
                ))}
              </CFormSelect>
              <CFormSelect
                value={row.locationType || 'ONSITE'}
                onChange={(event) => updateRow(index, 'locationType', event.target.value)}
                invalid={!!errors[`locationType_${index}`]}
              >
                {locationOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </CFormSelect>
              <CFormInput
                type="number"
                value={row.count}
                min="1"
                step="1"
                onChange={(event) => updateRow(index, 'count', event.target.value)}
                invalid={!!errors[`count_${index}`]}
              />
              <CFormInput
                list={`allocation-options-${index}`}
                type="number"
                value={row.allocationPercent}
                min="0"
                max="100"
                step="0.1"
                onChange={(event) => updateRow(index, 'allocationPercent', event.target.value)}
                invalid={!!errors[`allocation_${index}`]}
              />
              <datalist id={`allocation-options-${index}`}>
                {allocationOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <DateDisplayInput
                value={rowWithDates.startDate}
                min={deliveryDetails.start_date || undefined}
                max={deliveryDetails.planned_end_date || undefined}
                onChange={(value) => updateRow(index, 'startDate', value)}
                invalid={!!errors[`startDate_${index}`]}
              />
              <DateDisplayInput
                value={rowWithDates.endDate}
                min={deliveryDetails.start_date || undefined}
                max={deliveryDetails.planned_end_date || undefined}
                onChange={(value) => updateRow(index, 'endDate', value)}
                invalid={!!errors[`endDate_${index}`]}
              />
              <div className="derived-cell">{formatCurrency(plannedRow.ratePerDay || row.ratePerDay || 0)}</div>
              <div className="derived-cell">{plannedRow.plannedEffort?.toFixed(2) || '0.00'}</div>
              <div className="derived-cell">{formatCurrency(plannedRow.plannedCost || 0)}</div>
              <CButton color="danger" size="sm" className="remove-button-danger" onClick={() => removeRow(index)}>
                Remove
              </CButton>
            </div>
          );
        })}
      </div>
      {Object.entries(errors)
        .filter(([key]) => key.startsWith('role_') || key.startsWith('locationType_') || key.startsWith('count_') || key.startsWith('allocation_') || key.startsWith('startDate_') || key.startsWith('endDate_'))
        .map(([key, value]) => <div key={key} className="form-error mt-2">{value}</div>)}
      {errors.teamComposition && <div className="form-error mt-3">{errors.teamComposition}</div>}
      <div className="mb-4 mt-4">
        <CButton color="secondary" onClick={addRow}>Add Role</CButton>
      </div>

      {recommendation && (
        <div className="mb-4">
          <label className="form-label">PM override reason</label>
          <CFormTextarea
            rows={2}
            value={mlRecommendation.overrideReason || ''}
            onChange={(event) => updateMlRecommendation({ overrideReason: event.target.value })}
            placeholder="Optional reason when final loading differs from ML recommendation"
          />
        </div>
      )}

      <div className="derived-summary-grid">
        <div><strong>Base resource cost</strong><span>{formatCurrency(derived.baseResourceCost)}</span></div>
        <div><strong>Planned Effort (PD)</strong><span>{derived.planned_effort.toFixed(2)}</span></div>
        <div><strong>Estimated team size</strong><span>{derived.estimated_team_size.toFixed(2)}</span></div>
        <div><strong>Budget with reserves</strong><span>{formatCurrency(derived.budget)}</span></div>
      </div>
    </div>
  );
};

export default TeamCompositionStep;
