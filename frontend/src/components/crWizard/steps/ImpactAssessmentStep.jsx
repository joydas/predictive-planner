import React from 'react';
import { CCol, CFormInput, CFormTextarea, CRow } from '@coreui/react';

const ImpactAssessmentStep = ({ data, updateSection, errors }) => (
  <div className="wizard-step-panel">
    <h3>Impact Assessment</h3>
    <CRow className="g-3">
      <CCol md={4}>
        <label className="form-label">Schedule Impact Days</label>
        <CFormInput type="number" min="0" value={data.scheduleImpactDays} onChange={(event) => updateSection({ scheduleImpactDays: event.target.value })} />
      </CCol>
      <CCol md={4}>
        <label className="form-label">Estimated Effort Hours</label>
        <CFormInput type="number" min="0" value={data.estimatedEffortHours} onChange={(event) => updateSection({ estimatedEffortHours: event.target.value })} />
      </CCol>
      <CCol md={4}>
        <label className="form-label">Estimated Cost Impact</label>
        <CFormInput type="number" min="0" value={data.estimatedCostImpact} onChange={(event) => updateSection({ estimatedCostImpact: event.target.value })} />
      </CCol>
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
  </div>
);

export default ImpactAssessmentStep;
