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
          <DetailItem label="Estimated Effort (PD)" value={state.impact.estimatedEffortHours} />
          <DetailItem label="Additional Budget Impact" value={state.financial.additionalBudget} />
          <DetailItem label="Environments affected" value={state.impact.environmentsAffected} />
        </CCol>
      </CRow>
      <CRow>
        <CCol md={12}>
          <h5>Team Impact</h5>
          <DetailItem label="Approved staffing rows referenced" value={(state.teamImpact.staffingBaselineSnapshot || []).length} />
          <DetailItem label="CR staffing delta rows" value={(state.teamImpact.staffingDeltas || []).length} />
          {(state.teamImpact.staffingDeltas || []).map((row, index) => (
            <DetailItem
              key={row.key || index}
              label={`${row.changeType || 'ADJUST'} ${row.role || 'Role'}`}
              value={`${row.count || 0} resources, ${row.allocationPercent || 0}% allocation, ${row.plannedEffort || 0} PD`}
            />
          ))}
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
