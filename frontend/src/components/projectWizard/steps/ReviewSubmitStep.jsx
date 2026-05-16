import React from 'react';
import { CRow, CCol, CTable, CTableBody, CTableDataCell, CTableRow, CButton, CFormFeedback, CFormTextarea } from '@coreui/react';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { formatCurrency } from '../../../utils/resourcePlanning';

const sectionSummary = [
  { key: 'basicInfo', label: 'Basic Information' },
  { key: 'deliveryDetails', label: 'Delivery & Timeline' },
  { key: 'technology', label: 'Technology & Architecture' },
  { key: 'risks', label: 'Risks & Dependencies' },
  { key: 'financial', label: 'Financial Assumptions' },
  { key: 'teamComposition', label: 'Resource Loading & Planning' },
];

const empty = '-';

const ReviewSubmitStep = ({ state, onEdit, submitComment, onSubmitCommentChange, commentError }) => {
  const isAgile = String(state.basicInfo.delivery_model || '').toLowerCase() === 'agile';

  const getStatus = (section) => {
    const value = state[section];
    if (!value) return 'Missing';

    if (section === 'teamComposition') {
      return value.rows && value.rows.length ? 'Completed' : 'Missing';
    }

    if (section === 'mlRecommendation') {
      return value.recommendation ? 'Completed' : 'Pending';
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
            <p><strong>Project:</strong> {state.basicInfo.project_name || empty}</p>
            <p><strong>Client:</strong> {state.basicInfo.client_name || empty}</p>
            <p><strong>Industry:</strong> {state.basicInfo.industry || empty}</p>
            <p><strong>Delivery model:</strong> {state.basicInfo.delivery_model || empty}</p>
            <p><strong>Business criticality:</strong> {state.basicInfo.business_criticality || empty}</p>
          </CCol>
          <CCol md={6}>
            <h5>Delivery & Timeline</h5>
            <p><strong>Start:</strong> {formatDisplayDate(state.deliveryDetails.start_date)}</p>
            <p><strong>Planned end:</strong> {formatDisplayDate(state.deliveryDetails.planned_end_date)}</p>
            <p><strong>Sprint length:</strong> {state.deliveryDetails.sprint_length || empty}</p>
            <p><strong>Frequency:</strong> {state.deliveryDetails.release_frequency || empty}</p>
            {!isAgile && <p><strong>Milestones:</strong> {state.deliveryDetails.milestone_count || empty}</p>}
          </CCol>
        </CRow>
        <CRow>
          <CCol md={6}>
            <h5>Technology</h5>
            <p><strong>Stack:</strong> {state.technology.technology_stack || empty}</p>
            <p><strong>Architecture:</strong> {state.technology.architecture_type || empty}</p>
            <p><strong>Cloud platform:</strong> {state.technology.cloud_platform || empty}</p>
            <p><strong>Integrations:</strong> {state.technology.integration_count || empty}</p>
            <p><strong>External dependencies:</strong> {state.technology.external_dependencies || empty}</p>
            <p><strong>Complexity:</strong> {state.technology.complexity || empty}</p>
          </CCol>
          <CCol md={6}>
            <h5>Risks</h5>
            <p><strong>Dependencies:</strong> {state.risks.dependency_count || empty}</p>
            <p><strong>Compliance:</strong> {state.risks.compliance_requirements || empty}</p>
            <p><strong>Criticality:</strong> {state.risks.criticality || empty}</p>
            <p><strong>Stability index:</strong> {state.risks.requirement_stability_index || empty}</p>
            <p><strong>Expected CR volatility:</strong> {state.risks.expected_cr_volatility || empty}</p>
            <p><strong>Risk indicators:</strong> {state.risks.risk_level_indicators || empty}</p>
          </CCol>
        </CRow>
        <CRow>
          <CCol md={6}>
            <h5>Financials</h5>
            <p><strong>Billing model:</strong> {state.financial.billing_model || empty}</p>
            <p><strong>Management reserve:</strong> {state.financial.management_reserve_percent || 0}%</p>
            <p><strong>Contingency reserve:</strong> {state.financial.contingency_reserve_percent || 0}%</p>
            <p><strong>Derived budget:</strong> {formatCurrency(state.financial.budget || 0)}</p>
            <p><strong>Derived effort:</strong> {state.financial.planned_effort || empty} person-days</p>
            <p><strong>Derived team size:</strong> {state.financial.estimated_team_size || empty}</p>
          </CCol>
          <CCol md={6}>
            <h5>ML Recommendation</h5>
            <p><strong>Predicted effort:</strong> {Math.round(state.mlRecommendation.recommendation?.effort?.predictedHours || 0)} hours</p>
            <p><strong>Predicted risk:</strong> {state.mlRecommendation.recommendation?.risk?.riskLevel || empty}</p>
          </CCol>
        </CRow>
        <CRow>
          <CCol md={12} className="mb-3">
            <h5>Resource Loading</h5>
            {state.teamComposition.rows && state.teamComposition.rows.length > 0 ? (
              <ul className="review-list">
                {state.teamComposition.rows.map((row, index) => (
                  <li key={index}>
                    {row.role} - {row.locationType || empty} - {row.count} at {row.allocationPercent || 0}% from {formatDisplayDate(row.startDate)} to {formatDisplayDate(row.endDate)}
                    {' '}({formatCurrency(row.plannedCost || 0)})
                  </li>
                ))}
              </ul>
            ) : (
              <p>No roles configured</p>
            )}
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
