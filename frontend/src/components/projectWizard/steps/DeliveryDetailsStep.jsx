import React from 'react';
import { CRow, CCol, CForm, CFormInput, CFormSelect } from '@coreui/react';
import DateDisplayInput from '../DateDisplayInput';

const releaseOptions = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'];

const DeliveryDetailsStep = ({ data, deliveryModel, updateSection, errors }) => {
  const isAgile = String(deliveryModel || '').toLowerCase() === 'agile';
  const handleChange = (field) => (event) => {
    updateSection({ [field]: event.target.value });
  };

  return (
    <div className="wizard-step-panel">
      <h3>Delivery & Timeline</h3>
      <CForm>
        <CRow className="mb-4">
          <CCol md={4}>
            <label className="form-label">Start Date</label>
            <DateDisplayInput
              value={data.start_date}
              onChange={(value) => updateSection({ start_date: value })}
              invalid={!!errors.start_date}
            />
            {errors.start_date && <div className="form-error">{errors.start_date}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Planned End Date</label>
            <DateDisplayInput
              value={data.planned_end_date}
              onChange={(value) => updateSection({ planned_end_date: value })}
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
          {!isAgile && (
            <CCol md={4}>
              <label className="form-label">Milestone Count</label>
              <CFormInput
                type="number"
                value={data.milestone_count}
                onChange={handleChange('milestone_count')}
                invalid={!!errors.milestone_count}
                min="0"
              />
              {errors.milestone_count && <div className="form-error">{errors.milestone_count}</div>}
            </CCol>
          )}
        </CRow>
      </CForm>
    </div>
  );
};

export default DeliveryDetailsStep;
