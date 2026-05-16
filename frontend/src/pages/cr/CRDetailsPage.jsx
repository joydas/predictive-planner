import React, { useCallback, useEffect, useState } from 'react';
import { CAlert, CBadge, CButton, CCol, CRow, CSpinner } from '@coreui/react';
import { useNavigate, useParams } from 'react-router-dom';
import WorkflowPanel from '../../components/WorkflowPanel';
import { getChangeRequest, transitionChangeRequest } from '../../services/crService';
import authService from '../../services/authService';
import { formatDisplayDateTime } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/resourcePlanning';
import '../../styles/projectWizard.css';

const statusColors = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  RETURNED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

const valueOrDash = (value) => (value === null || value === undefined || value === '' ? '-' : value);
const DetailItem = ({ label, value }) => <p><strong>{label}:</strong> {valueOrDash(value)}</p>;

const CRDetailsPage = () => {
  const { crId } = useParams();
  const navigate = useNavigate();
  const [changeRequest, setChangeRequest] = useState(null);
  const [workflowHistory, setWorkflowHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const loadCr = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getChangeRequest(crId);
      setChangeRequest(result.changeRequest);
      setWorkflowHistory(result.workflowHistory || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load change request');
    } finally {
      setLoading(false);
    }
  }, [crId]);

  useEffect(() => {
    loadCr();
  }, [loadCr]);

  const handleWorkflowAction = async (action, comment) => {
    setActionLoading(true);
    try {
      const result = await transitionChangeRequest(crId, action, comment);
      setWorkflowHistory(result.workflowHistory || []);
      setChangeRequest((current) => ({
        ...current,
        workflowStatus: result.transition.toStatus,
        status: result.transition.toStatus,
        latestComment: result.transition.latestComment,
      }));
      setError('');
    } catch (err) {
      setError(err.message || 'Workflow transition failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <CSpinner />
      </div>
    );
  }

  if (!changeRequest) {
    return <CAlert color="danger">{error || 'Change request not found'}</CAlert>;
  }

  const status = String(changeRequest.workflowStatus || changeRequest.status || 'DRAFT').toUpperCase();
  const isPm = String(authService.getUserRole() || '').toUpperCase() === 'PM';
  const canEdit = isPm && ['DRAFT', 'RETURNED'].includes(status);

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <CButton color="secondary" variant="outline" onClick={() => navigate('/crs')}>
              Back to CRs
            </CButton>
            <div>
              <h1 className="page-title mb-1">{changeRequest.crNumber}</h1>
              <div className="d-flex gap-2 align-items-center flex-wrap">
                <p className="text-muted mb-0">{changeRequest.title || 'Untitled change request'}</p>
                <CBadge color={statusColors[status] || 'secondary'}>{status}</CBadge>
              </div>
            </div>
          </div>
        </CCol>
      </CRow>

      {error && <CAlert color="danger">{error}</CAlert>}
      {canEdit && (
        <div className="mb-3">
          <CButton color="primary" onClick={() => navigate(`/crs/create?crId=${changeRequest.crId}`)}>
            Edit and Resubmit
          </CButton>
        </div>
      )}

      <CRow>
        <CCol lg={8}>
          <div className="review-summary-grid">
            <CRow>
              <CCol md={6}>
                <h5>CR Summary</h5>
                <DetailItem label="Project" value={changeRequest.projectName} />
                <DetailItem label="Project code" value={changeRequest.projectCode} />
                <DetailItem label="Title" value={changeRequest.title} />
                <DetailItem label="Description" value={changeRequest.description} />
                <DetailItem label="Category" value={changeRequest.category} />
                <DetailItem label="Severity" value={changeRequest.severity} />
                <DetailItem label="Priority" value={changeRequest.priority} />
                <DetailItem label="Affected module" value={changeRequest.affectedModule} />
              </CCol>
              <CCol md={6}>
                <h5>Impact Analysis</h5>
                <DetailItem label="Schedule impact days" value={changeRequest.scheduleImpactDays} />
                <DetailItem label="Estimated effort hours" value={changeRequest.estimatedEffortHours} />
                <DetailItem label="Estimated cost" value={formatCurrency(changeRequest.estimatedCostImpact || 0)} />
                <DetailItem label="Dependency impact" value={changeRequest.dependencyImpact} />
                <DetailItem label="Environments affected" value={changeRequest.environmentsAffected} />
              </CCol>
            </CRow>
            <CRow>
              <CCol md={6}>
                <h5>Team Impact</h5>
                <DetailItem label="Additional PM" value={changeRequest.additionalPmCount} />
                <DetailItem label="Additional Dev" value={changeRequest.additionalDevCount} />
                <DetailItem label="Additional QA" value={changeRequest.additionalQaCount} />
                <DetailItem label="Additional DevOps" value={changeRequest.additionalDevOpsCount} />
                <DetailItem label="Additional Architect" value={changeRequest.additionalArchitectCount} />
              </CCol>
              <CCol md={6}>
                <h5>Financial Impact</h5>
                <DetailItem label="Additional budget" value={formatCurrency(changeRequest.additionalBudget || 0)} />
                <DetailItem label="Licensing cost" value={formatCurrency(changeRequest.additionalLicensingCost || 0)} />
                <DetailItem label="Infrastructure cost" value={formatCurrency(changeRequest.infrastructureCostImpact || 0)} />
              </CCol>
            </CRow>
            <CRow>
              <CCol md={12}>
                <h5>Review Comments</h5>
                <DetailItem label="Latest comment" value={changeRequest.latestComment} />
                <DetailItem label="Submitted at" value={formatDisplayDateTime(changeRequest.submittedAt)} />
                <DetailItem label="Approved at" value={formatDisplayDateTime(changeRequest.approvedAt)} />
              </CCol>
            </CRow>
          </div>
        </CCol>
        <CCol lg={4}>
          <WorkflowPanel
            status={status}
            history={workflowHistory}
            onAction={handleWorkflowAction}
            loading={actionLoading}
            title="Workflow Timeline"
            allowRejectedSubmit={false}
          />
        </CCol>
      </CRow>
    </div>
  );
};

export default CRDetailsPage;
