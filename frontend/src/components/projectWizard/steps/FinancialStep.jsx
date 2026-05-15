import React from 'react';
import { CRow, CCol, CForm, CFormInput } from '@coreui/react';

const FinancialStep = ({ data, updateSection, errors }) => {
  const handleChange = (field) => (event) => {
    updateSection({ [field]: event.target.value });
  };

  return (
    <div className="wizard-step-panel">
      <h3>Financials & Planning</h3>
      <CForm>
        <CRow className="mb-4">
          <CCol md={4}>
            <label className="form-label">Budget</label>
            <CFormInput
              type="number"
              value={data.budget}
              onChange={handleChange('budget')}
              invalid={!!errors.budget}
              min="0"
            />
            {errors.budget && <div className="form-error">{errors.budget}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Planned Effort (hours)</label>
            <CFormInput
              type="number"
              value={data.planned_effort}
              onChange={handleChange('planned_effort')}
              invalid={!!errors.planned_effort}
              min="0"
            />
            {errors.planned_effort && <div className="form-error">{errors.planned_effort}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Estimated Team Size</label>
            <CFormInput
              type="number"
              value={data.estimated_team_size}
              onChange={handleChange('estimated_team_size')}
              invalid={!!errors.estimated_team_size}
              min="1"
            />
            {errors.estimated_team_size && <div className="form-error">{errors.estimated_team_size}</div>}
          </CCol>
        </CRow>
      </CForm>
    </div>
  );
};

export default FinancialStep;
