import React from 'react';
import { CRow, CCol, CForm, CFormInput, CFormSelect } from '@coreui/react';

const releaseOptions = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'];

const DeliveryDetailsStep = ({ data, updateSection, errors }) => {
  const handleChange = (field) => (event) => {
    updateSection({ [field]: event.target.value });
  };

  return (
    <div className="wizard-step-panel">
      <h3>Delivery Details</h3>
      <CForm>
        <CRow className="mb-4">
          <CCol md={4}>
            <label className="form-label">Start Date</label>
            <CFormInput
              type="date"
              value={data.start_date}
              onChange={handleChange('start_date')}
              invalid={!!errors.start_date}
            />
            {errors.start_date && <div className="form-error">{errors.start_date}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Planned End Date</label>
            <CFormInput
              type="date"
              value={data.planned_end_date}
              onChange={handleChange('planned_end_date')}
              invalid={!!errors.planned_end_date}
            />
            {errors.planned_end_date && <div className="form-error">{errors.planned_end_date}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Sprint Length (weeks)</label>
            <CFormInput
              type="number"
              value={data.sprint_length}
              onChange={handleChange('sprint_length')}
              invalid={!!errors.sprint_length}
              min="1"
            />
            {errors.sprint_length && <div className="form-error">{errors.sprint_length}</div>}
          </CCol>
        </CRow>
        <CRow>
          <CCol md={4}>
            <label className="form-label">Release Frequency</label>
            <CFormSelect
              value={data.release_frequency}
              onChange={handleChange('release_frequency')}
              invalid={!!errors.release_frequency}
            >
              <option value="">Select frequency</option>
              {releaseOptions.map((frequency) => (
                <option key={frequency} value={frequency}>{frequency}</option>
              ))}
            </CFormSelect>
            {errors.release_frequency && <div className="form-error">{errors.release_frequency}</div>}
          </CCol>
        </CRow>
      </CForm>
    </div>
  );
};

export default DeliveryDetailsStep;
