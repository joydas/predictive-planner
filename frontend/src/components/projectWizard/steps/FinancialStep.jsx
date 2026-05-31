import React from 'react';
import { CRow, CCol, CForm, CFormInput, CFormSelect } from '@coreui/react';

const billingModels = ['Fixed Price', 'Time & Material', 'Milestone Based', 'Retainer'];

const FinancialStep = ({ data, updateSection, errors }) => {
  const handleChange = (field) => (event) => {
    updateSection({ [field]: event.target.value });
  };

  return (
    <div className="project-info-section">
      <h3 className="project-info-section-heading">Financial Assumptions</h3>
      <CForm>
        <CRow className="mb-4">
          <CCol md={4}>
            <label className="form-label">Management Reserve %</label>
            <CFormInput
              type="number"
              value={data.management_reserve_percent}
              onChange={handleChange('management_reserve_percent')}
              invalid={!!errors.management_reserve_percent}
              min="0"
              max="100"
              step="0.1"
            />
            {errors.management_reserve_percent && <div className="form-error">{errors.management_reserve_percent}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Contingency Reserve %</label>
            <CFormInput
              type="number"
              value={data.contingency_reserve_percent}
              onChange={handleChange('contingency_reserve_percent')}
              invalid={!!errors.contingency_reserve_percent}
              min="0"
              max="100"
              step="0.1"
            />
            {errors.contingency_reserve_percent && <div className="form-error">{errors.contingency_reserve_percent}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Billing Model</label>
            <CFormSelect
              value={data.billing_model}
              onChange={handleChange('billing_model')}
              invalid={!!errors.billing_model}
            >
              <option value="">Select billing model</option>
              {billingModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </CFormSelect>
            {errors.billing_model && <div className="form-error">{errors.billing_model}</div>}
          </CCol>
        </CRow>
      </CForm>
    </div>
  );
};

export default FinancialStep;
