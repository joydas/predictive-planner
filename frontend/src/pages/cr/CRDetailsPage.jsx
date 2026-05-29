import React, { useCallback, useEffect, useState } from 'react';
import { CAlert, CBadge, CButton, CCol, CRow, CSpinner } from '@coreui/react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import WorkflowPanel from '../../components/WorkflowPanel';
import { getChangeRequest, transitionChangeRequest } from '../../services/crService';
import authService from '../../services/authService';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/dateUtils';
import { formatCurrency, parseNumber } from '../../utils/resourcePlanning';
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

const formatNumber = (value) => parseNumber(value, 0).toFixed(2);

const getBaselineKey = (row, index) => row.key || `baseline-${index}`;

const buildStaffingComparisonRows = (changeRequest) => {
  const baselineRows = changeRequest.staffingBaselineSnapshot || [];
  const deltas = changeRequest.staffingDeltas || [];
  const baselineByKey = baselineRows.reduce((acc, row, index) => ({
    ...acc,
    [getBaselineKey(row, index)]: row,
  }), {});

  return deltas.map((delta, index) => {
    const baseline = delta.baselineKey ? baselineByKey[delta.baselineKey] : null;
    const isAdjust = String(delta.changeType || '').toUpperCase() === 'ADJUST' && baseline;
    const revised = isAdjust
      ? {
        ...baseline,
        count: parseNumber(baseline.count, 0) + parseNumber(delta.count, 0),
        allocationPercent: parseNumber(baseline.allocationPercent, 0) + parseNumber(delta.allocationPercent, 0),
        startDate: delta.startDate || baseline.startDate,
        endDate: delta.endDate || baseline.endDate,
        ratePerDay: delta.ratePerDay || baseline.ratePerDay,
        plannedEffort: parseNumber(baseline.plannedEffort, 0) + parseNumber(delta.plannedEffort, 0),
        plannedCost: parseNumber(baseline.plannedCost, 0) + parseNumber(delta.plannedCost, 0),
      }
      : {
        role: delta.role,
        locationType: delta.locationType,
        count: delta.targetCount ?? delta.count,
        allocationPercent: delta.targetAllocationPercent ?? delta.allocationPercent,
        startDate: delta.targetStartDate || delta.startDate,
        endDate: delta.targetEndDate || delta.endDate,
        ratePerDay: delta.ratePerDay,
        plannedEffort: delta.plannedEffort,
        plannedCost: delta.plannedCost,
      };

    return {
      key: delta.key || `delta-${index}`,
      action: isAdjust ? 'Adjust' : 'Add',
      role: revised.role || delta.role || baseline?.role || '-',
      locationType: revised.locationType || delta.locationType || baseline?.locationType || '-',
      baseline,
      revised,
      delta,
    };
  });
};

const StaffingValue = ({ row }) => (
  <div className="cr-staffing-compare-value">
    <span>{formatNumber(row?.count)} count</span>
    <span>{formatNumber(row?.allocationPercent)}%</span>
    <span>{formatDisplayDate(row?.startDate)} to {formatDisplayDate(row?.endDate)}</span>
    <span>{formatNumber(row?.plannedEffort)} PD</span>
    <span>{formatCurrency(row?.plannedCost || 0)}</span>
  </div>
);

const StaffingDeltaValue = ({ row }) => (
  <div className="cr-staffing-compare-value">
    <span>{formatNumber(row?.count)} count</span>
    <span>{formatNumber(row?.allocationPercent)}%</span>
    <span>{formatNumber(row?.plannedEffort)} PD</span>
    <span>{formatCurrency(row?.plannedCost || 0)}</span>
  </div>
);

const CRDetailsPage = () => {
  const { crId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [changeRequest, setChangeRequest] = useState(null);
  const [workflowHistory, setWorkflowHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [workflowNotice, setWorkflowNotice] = useState(location.state?.workflowNotice || '');

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

  useEffect(() => {
    if (!location.state?.workflowNotice) return;

    setWorkflowNotice(location.state.workflowNotice);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!workflowNotice) return undefined;

    const timeoutId = window.setTimeout(() => {
      setWorkflowNotice('');
    }, 6000);

    return () => window.clearTimeout(timeoutId);
  }, [workflowNotice]);

  const handleWorkflowAction = async (action, comment) => {
    setActionLoading(true);
    try {
      await transitionChangeRequest(crId, action, comment);
      await loadCr();
      setWorkflowNotice(action === 'submit' ? 'Change request submitted successfully. Latest workflow state loaded.' : 'Workflow action completed. Latest change request state loaded.');
      setError('');
    } catch (err) {
      setError(err.message || 'Workflow transition failed');
      throw err;
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
  const canEdit = isPm
    && ['DRAFT', 'RETURNED'].includes(status)
    && String(changeRequest.projectWorkflowStatus || '').toUpperCase() !== 'COMPLETE';
  const staffingComparisons = buildStaffingComparisonRows(changeRequest);

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

      {workflowNotice && <CAlert color="success">{workflowNotice}</CAlert>}
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
                <DetailItem label="Estimated Effort (PD)" value={changeRequest.estimatedEffortHours} />
                <DetailItem label="Additional Budget Impact" value={formatCurrency(changeRequest.additionalBudget || changeRequest.budgetImpact || 0)} />
                <DetailItem label="Dependency impact" value={changeRequest.dependencyImpact} />
                <DetailItem label="Environments affected" value={changeRequest.environmentsAffected} />
              </CCol>
            </CRow>
            <CRow>
              <CCol md={12}>
                <h5>Team Impact: Baseline vs Revised</h5>
                {staffingComparisons.length === 0 ? (
                  <p className="text-muted mb-0">No staffing changes captured for this CR.</p>
                ) : (
                  <div className="cr-staffing-compare-grid">
                    <div className="cr-staffing-compare-row cr-staffing-compare-header">
                      <div>Role</div>
                      <div>Location type</div>
                      <div>Baseline</div>
                      <div>Revised</div>
                      <div>Delta</div>
                    </div>
                    {staffingComparisons.map((comparison) => (
                      <div key={comparison.key} className="cr-staffing-compare-row">
                        <div>{comparison.action} {comparison.role}</div>
                        <div>{comparison.locationType}</div>
                        <div>{comparison.baseline ? <StaffingValue row={comparison.baseline} /> : '-'}</div>
                        <div><StaffingValue row={comparison.revised} /></div>
                        <div><StaffingDeltaValue row={comparison.delta} /></div>
                      </div>
                    ))}
                  </div>
                )}
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
