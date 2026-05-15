import React, { useState } from 'react';
import { CRow, CCol, CForm, CFormInput, CFormSelect, CButton, CAlert, CSpinner } from '@coreui/react';
import { getMlRecommendation } from '../../../services/projectService';

const roleOptions = ['PM', 'BA', 'Python SSE', 'Manual Tester', 'QA', 'UX', 'Developer', 'DevOps'];
const locationOptions = ['Onshore', 'Offshore', 'Hybrid'];

const displayRole = (role) => String(role || '').replace(/_/g, ' ');

const TeamCompositionStep = ({ data, projectData, updateSection, setTeamRows, errors }) => {
  const [recommendation, setRecommendation] = useState(null);
  const [recommendationError, setRecommendationError] = useState('');
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);

  const updateRow = (index, field, value) => {
    const updatedRows = data.rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row
    );
    setTeamRows(updatedRows);
  };

  const addRow = () => {
    setTeamRows([
      ...data.rows,
      {
        role: 'Developer',
        count: 1,
        avgExperience: '',
        location: 'Onshore',
      },
    ]);
  };

  const removeRow = (index) => {
    const updatedRows = data.rows.filter((_, rowIndex) => rowIndex !== index);
    setTeamRows(updatedRows);
  };

  const applyRecommendedTeam = (recommendedTeam) => {
    const rows = Object.entries(recommendedTeam || {})
      .filter(([, count]) => Number(count) > 0)
      .map(([role, count]) => ({
        role: displayRole(role),
        count,
        avgExperience: '',
        location: 'Hybrid',
      }));

    if (rows.length) {
      setTeamRows(rows);
    }
  };

  const handleGetRecommendation = async () => {
    setLoadingRecommendation(true);
    setRecommendationError('');
    try {
      const result = await getMlRecommendation(projectData);
      setRecommendation(result);
      applyRecommendedTeam(result.staffing?.recommendedTeam);
    } catch (error) {
      setRecommendationError(error.message || 'Unable to get ML recommendation');
    } finally {
      setLoadingRecommendation(false);
    }
  };

  return (
    <div className="wizard-step-panel">
      <div className="team-composition-title-row">
        <h3>Team Composition</h3>
        <CButton color="primary" variant="outline" onClick={handleGetRecommendation} disabled={loadingRecommendation}>
          {loadingRecommendation ? <><CSpinner size="sm" /> Getting Recommendation</> : 'Get ML Recommendation'}
        </CButton>
      </div>
      {recommendationError && <CAlert color="danger">{recommendationError}</CAlert>}
      {recommendation && (
        <CAlert color="info" className="ml-recommendation-panel">
          <div className="ml-recommendation-grid">
            <div>
              <strong>Recommended Staffing</strong>
              <div className="ml-recommendation-team">
                {Object.entries(recommendation.staffing?.recommendedTeam || {}).map(([role, count]) => (
                  <span key={role}>{displayRole(role)}: {count}</span>
                ))}
              </div>
            </div>
            <div>
              <strong>Effort</strong>
              <div>{Math.round(recommendation.effort?.predictedHours || 0)} hours</div>
            </div>
            <div>
              <strong>Schedule Risk</strong>
              <div>{recommendation.risk?.riskLevel || 'Unknown'}</div>
            </div>
          </div>
          <div className="ml-recommendation-explanation">
            {(recommendation.explanation || recommendation.staffing?.explanation || []).map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </CAlert>
      )}
      <div className="team-composition-grid">
        <div className="team-composition-row team-composition-header">
          <div>Role</div>
          <div>Count</div>
          <div>Avg Experience</div>
          <div>Location</div>
          <div /></div>
        {data.rows.map((row, index) => (
          <div key={index} className="team-composition-row">
            <CFormSelect
              value={row.role}
              onChange={(event) => updateRow(index, 'role', event.target.value)}
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            <CFormInput
              type="number"
              value={row.count}
              min="1"
              onChange={(event) => updateRow(index, 'count', event.target.value)}
            />
            <CFormInput
              type="number"
              value={row.avgExperience}
              min="0"
              step="0.5"
              onChange={(event) => updateRow(index, 'avgExperience', event.target.value)}
            />
            <CFormSelect
              value={row.location}
              onChange={(event) => updateRow(index, 'location', event.target.value)}
            >
              {locationOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            <CButton color="danger" size="sm" onClick={() => removeRow(index)}>
              Remove
            </CButton>
          </div>
        ))}
      </div>
      {errors.teamComposition && <div className="form-error mt-3">{errors.teamComposition}</div>}
      <div className="mb-4 mt-4">
        <CButton color="secondary" onClick={addRow}>Add Role</CButton>
      </div>
      <CForm>
        <CRow>
          <CCol md={6}>
            <label className="form-label">Locations</label>
            <CFormInput
              value={data.locations}
              onChange={(event) => updateSection({ locations: event.target.value })}
            />
          </CCol>
          <CCol md={6}>
            <label className="form-label">Offshore/Onshore Ratio</label>
            <CFormInput
              value={data.offshoreOnshoreRatio}
              onChange={(event) => updateSection({ offshoreOnshoreRatio: event.target.value })}
            />
          </CCol>
        </CRow>
      </CForm>
    </div>
  );
};

export default TeamCompositionStep;
