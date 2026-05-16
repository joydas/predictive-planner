import React, { useState } from 'react';
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
  const roles = masterData.roles || [];
  const rateCards = masterData.rateCards || financial.rateCards || [];
  const derived = deriveResourcePlanning({ rows: data.rows, financial, rateCards });

  const resolveRole = (roleId) => roles.find((role) => String(role.roleId) === String(roleId));
  const resolveRate = (roleId, locationType) => getRateForRole(roleId, locationType, rateCards);

  const withProjectDates = (row) => ({
    ...row,
    startDate: row.startDate || deliveryDetails.start_date || '',
    endDate: row.endDate || deliveryDetails.planned_end_date || '',
  });

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
    const fallbackRole = roles[0] || {};
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

  const applyRecommendedTeam = (recommendedTeam) => {
    const rows = Object.entries(recommendedTeam || {})
      .filter(([, count]) => Number(count) > 0)
      .map(([roleName, count]) => {
        const normalizedRole = roleAliases[roleName] || roleAliases[displayRole(roleName)] || displayRole(roleName);
        const selectedRole = roles.find((role) => role.roleName === normalizedRole)
          || roles.find((role) => role.roleName.toLowerCase() === normalizedRole.toLowerCase())
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
      });

    if (rows.length) {
      setTeamRows(rows);
    }
  };

  const handleGetRecommendation = async () => {
    setLoadingRecommendation(true);
    setRecommendationError('');
    try {
      const result = await getMlRecommendation(projectData);
      updateMlRecommendation({
        recommendation: result,
        acceptedAt: new Date().toISOString(),
      });
      applyRecommendedTeam(result.staffing?.recommendedTeam);
    } catch (error) {
      setRecommendationError(error.message || 'Unable to get ML recommendation');
    } finally {
      setLoadingRecommendation(false);
    }
  };

  const recommendation = mlRecommendation.recommendation;

  return (
    <div className="wizard-step-panel">
      <div className="team-composition-title-row">
        <h3>Resource Loading & Planning</h3>
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
              <strong>ML Predicted Effort</strong>
              <div>{Math.round(recommendation.effort?.predictedHours || 0)} hours</div>
            </div>
            <div>
              <strong>ML Predicted Risk</strong>
              <div>{recommendation.risk?.riskLevel || 'Unknown'}</div>
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
          <div>Effort</div>
          <div>Cost</div>
          <div />
        </div>
        {data.rows.map((row, index) => {
          const plannedRow = derived.rows[index] || row;
          const rowWithDates = withProjectDates(row);
          return (
            <div key={index} className="resource-loading-row">
              <CFormSelect
                value={row.roleId}
                onChange={(event) => updateRow(index, 'roleId', event.target.value)}
                invalid={!!errors[`role_${index}`]}
              >
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.roleId} value={role.roleId}>{role.roleName}</option>
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
              <CButton color="danger" size="sm" onClick={() => removeRow(index)}>
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
        <div><strong>Planned effort</strong><span>{derived.planned_effort.toFixed(2)} person-days</span></div>
        <div><strong>Estimated team size</strong><span>{derived.estimated_team_size.toFixed(2)}</span></div>
        <div><strong>Budget with reserves</strong><span>{formatCurrency(derived.budget)}</span></div>
      </div>
    </div>
  );
};

export default TeamCompositionStep;
