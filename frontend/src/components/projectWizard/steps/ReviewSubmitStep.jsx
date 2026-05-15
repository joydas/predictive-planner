import React from 'react';
import { CRow, CCol, CTable, CTableBody, CTableDataCell, CTableRow, CButton, CFormFeedback, CFormTextarea } from '@coreui/react';

const sectionSummary = [
  { key: 'basicInfo', label: 'Basic Information' },
  { key: 'deliveryDetails', label: 'Delivery Details' },
  { key: 'teamComposition', label: 'Team Composition' },
  { key: 'technology', label: 'Technology & Architecture' },
  { key: 'financial', label: 'Financials & Planning' },
  { key: 'risks', label: 'Risks & Dependencies' },
];

const ReviewSubmitStep = ({ state, onEdit, submitComment, onSubmitCommentChange, commentError }) => {
  const getStatus = (section) => {
    const value = state[section];
    if (!value) return 'Missing';

    if (section === 'teamComposition') {
      return value.rows && value.rows.length ? 'Completed' : 'Missing';
    }

    return Object.values(value).some((field) => field === '' || field === null)
      ? 'Incomplete'
      : 'Completed';
  };

  return (
    <div className="wizard-step-panel">
      <h3>Review & Submit</h3>
      <p>Review all entered values before submission. Sections marked "Incomplete" can still be edited.</p>
      <CTable align="middle" className="mb-4">
        <CTableBody>
          {sectionSummary.map((section, index) => (
            <CTableRow key={section.key}>
              <CTableDataCell>{index + 1}. {section.label}</CTableDataCell>
              <CTableDataCell>{getStatus(section.key)}</CTableDataCell>
              <CTableDataCell>
                <CButton color="link" size="sm" onClick={() => onEdit(index)}>
                  Edit
                </CButton>
              </CTableDataCell>
            </CTableRow>
          ))}
        </CTableBody>
      </CTable>

      <div className="review-summary-grid">
        <CRow>
          <CCol md={6}>
            <h5>Basic Information</h5>
            <p><strong>Project:</strong> {state.basicInfo.project_name || '—'}</p>
            <p><strong>Client:</strong> {state.basicInfo.client_name || '—'}</p>
            <p><strong>Industry:</strong> {state.basicInfo.industry || '—'}</p>
            <p><strong>Delivery model:</strong> {state.basicInfo.delivery_model || '—'}</p>
          </CCol>
          <CCol md={6}>
            <h5>Delivery Details</h5>
            <p><strong>Start:</strong> {state.deliveryDetails.start_date || '—'}</p>
            <p><strong>Planned end:</strong> {state.deliveryDetails.planned_end_date || '—'}</p>
            <p><strong>Sprint length:</strong> {state.deliveryDetails.sprint_length || '—'}</p>
            <p><strong>Frequency:</strong> {state.deliveryDetails.release_frequency || '—'}</p>
          </CCol>
        </CRow>
        <CRow>
          <CCol md={12} className="mb-3">
            <h5>Team Composition</h5>
            {state.teamComposition.rows && state.teamComposition.rows.length > 0 ? (
              <ul className="review-list">
                {state.teamComposition.rows.map((row, index) => (
                  <li key={index}>
                    {row.role} &ndash; {row.count} people, {row.avgExperience || 'n/a'} yrs, {row.location || '—'}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No roles configured</p>
            )}
            <p><strong>Locations:</strong> {state.teamComposition.locations || '—'}</p>
            <p><strong>Offshore/Onshore:</strong> {state.teamComposition.offshoreOnshoreRatio || '—'}</p>
          </CCol>
        </CRow>
        <CRow>
          <CCol md={6}>
            <h5>Technology</h5>
            <p><strong>Stack:</strong> {state.technology.technology_stack || '—'}</p>
            <p><strong>Architecture:</strong> {state.technology.architecture_type || '—'}</p>
            <p><strong>Cloud platform:</strong> {state.technology.cloud_platform || '—'}</p>
            <p><strong>Integrations:</strong> {state.technology.integration_count || '—'}</p>
            <p><strong>Complexity:</strong> {state.technology.complexity || '—'}</p>
          </CCol>
          <CCol md={6}>
            <h5>Financials</h5>
            <p><strong>Budget:</strong> {state.financial.budget || '—'}</p>
            <p><strong>Planned effort:</strong> {state.financial.planned_effort || '—'}</p>
            <p><strong>Estimated team size:</strong> {state.financial.estimated_team_size || '—'}</p>
          </CCol>
        </CRow>
        <CRow>
          <CCol md={12}>
            <h5>Risks</h5>
            <p><strong>Dependencies:</strong> {state.risks.dependency_count || '—'}</p>
            <p><strong>Compliance:</strong> {state.risks.compliance_requirements || '—'}</p>
            <p><strong>Criticality:</strong> {state.risks.criticality || '—'}</p>
            <p><strong>Stability index:</strong> {state.risks.requirement_stability_index || '—'}</p>
          </CCol>
        </CRow>
      </div>

      <div className="mt-4">
        <label htmlFor="pmSubmitComment" className="form-label">
          PM submit comment <span style={{ color: '#f5576c' }}>*</span>
        </label>
        <CFormTextarea
          id="pmSubmitComment"
          rows={4}
          value={submitComment}
          onChange={(event) => onSubmitCommentChange(event.target.value)}
          placeholder="Add context for Account Manager review"
          invalid={!!commentError}
        />
        {commentError && (
          <CFormFeedback invalid className="d-block">
            {commentError}
          </CFormFeedback>
        )}
      </div>
    </div>
  );
};

export default ReviewSubmitStep;
