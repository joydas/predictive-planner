import React from 'react';
import { CCol, CFormTextarea, CRow } from '@coreui/react';

const valueOrDash = (value) => (value === null || value === undefined || value === '' ? '-' : value);
const DetailItem = ({ label, value }) => <p><strong>{label}:</strong> {valueOrDash(value)}</p>;

const ReviewSubmitStep = ({ state, selectedProject, submitComment, onSubmitCommentChange, commentError }) => (
  <div className="wizard-step-panel">
    <h3>Review & Submit</h3>
    <p>Review CR impact details before sending it to Account Manager review.</p>

    <div className="review-summary-grid">
      <CRow>
        <CCol md={6}>
          <h5>CR Summary</h5>
          <DetailItem label="Project" value={selectedProject?.projectName} />
          <DetailItem label="Title" value={state.basic.title} />
          <DetailItem label="Category" value={state.basic.category} />
          <DetailItem label="Severity" value={state.basic.severity} />
          <DetailItem label="Priority" value={state.basic.priority} />
          <DetailItem label="Affected module" value={state.basic.affectedModule} />
        </CCol>
        <CCol md={6}>
          <h5>Impact Analysis</h5>
          <DetailItem label="Schedule impact days" value={state.impact.scheduleImpactDays} />
          <DetailItem label="Estimated effort hours" value={state.impact.estimatedEffortHours} />
          <DetailItem label="Estimated cost impact" value={state.impact.estimatedCostImpact} />
          <DetailItem label="Environments affected" value={state.impact.environmentsAffected} />
        </CCol>
      </CRow>
      <CRow>
        <CCol md={6}>
          <h5>Team Impact</h5>
          <DetailItem label="PM" value={state.teamImpact.additionalPmCount} />
          <DetailItem label="Dev" value={state.teamImpact.additionalDevCount} />
          <DetailItem label="QA" value={state.teamImpact.additionalQaCount} />
          <DetailItem label="DevOps" value={state.teamImpact.additionalDevOpsCount} />
          <DetailItem label="Architect" value={state.teamImpact.additionalArchitectCount} />
        </CCol>
        <CCol md={6}>
          <h5>Financials</h5>
          <DetailItem label="Additional budget" value={state.financial.additionalBudget} />
          <DetailItem label="Licensing cost" value={state.financial.additionalLicensingCost} />
          <DetailItem label="Infrastructure cost" value={state.financial.infrastructureCostImpact} />
        </CCol>
      </CRow>
    </div>

    <div className="mt-4">
      <label htmlFor="crSubmitComment" className="form-label">
        PM submit comment <span style={{ color: '#f5576c' }}>*</span>
      </label>
      <CFormTextarea
        id="crSubmitComment"
        rows={4}
        value={submitComment}
        onChange={(event) => onSubmitCommentChange(event.target.value)}
        invalid={!!commentError}
      />
      {commentError && <div className="form-error">{commentError}</div>}
    </div>
  </div>
);

export default ReviewSubmitStep;
