import React, { useCallback, useEffect, useState } from 'react';
import {
  CAlert,
  CBadge,
  CButton,
  CCol,
  CRow,
  CSpinner,
} from '@coreui/react';
import { useNavigate, useParams } from 'react-router-dom';
import WorkflowPanel from '../components/WorkflowPanel';
import { getProject, transitionProject } from '../services/projectService';
import authService from '../services/authService';
import { formatDisplayDate } from '../utils/dateUtils';
import { formatCurrency, getInclusiveDays, parseNumber } from '../utils/resourcePlanning';
import '../styles/projectWizard.css';

const statusColors = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  RETURNED: 'warning',
  APPROVED: 'success',
  COMPLETE: 'dark',
  REJECTED: 'danger',
};

const valueOrDash = (value) => (value === null || value === undefined || value === '' ? '-' : value);

const DetailItem = ({ label, value }) => (
  <p><strong>{label}:</strong> {valueOrDash(value)}</p>
);

const normalizeDisplayResourceRow = (row = {}, deliveryDetails = {}) => ({
  ...row,
  locationType: row.locationType || row.location_type || row.location || 'ONSITE',
  count: parseNumber(row.count ?? row.resource_count, 0),
  allocationPercent: parseNumber(row.allocationPercent ?? row.allocation_percent ?? row.allocation ?? 100, 100),
  startDate: row.startDate || row.allocationStartDate || row.allocation_start_date || deliveryDetails.start_date || '',
  endDate: row.endDate || row.allocationEndDate || row.allocation_end_date || deliveryDetails.planned_end_date || '',
  ratePerDay: parseNumber(row.ratePerDay ?? row.rate_per_day ?? row.rate, 0),
  plannedEffort: parseNumber(row.plannedEffort ?? row.planned_effort ?? row.effort, 0),
  plannedCost: parseNumber(row.plannedCost ?? row.planned_cost ?? row.cost, 0),
});

const deriveDisplayResourcePlanning = (rows = [], financial = {}, deliveryDetails = {}) => {
  const normalizedRows = rows.map((row) => normalizeDisplayResourceRow(row, deliveryDetails));
  const displayRows = normalizedRows.map((row) => {
    const count = parseNumber(row.count, 0);
    const allocationPercent = parseNumber(row.allocationPercent, 100);
    const allocationMultiplier = allocationPercent / 100;
    const ratePerDay = parseNumber(row.ratePerDay, 0);
    const durationDays = getInclusiveDays(row.startDate, row.endDate);
    const effort = parseNumber(row.effort ?? row.plannedEffort ?? row.durationDays, durationDays);
    const plannedEffort = count * allocationMultiplier * effort;
    const plannedCost = count * allocationMultiplier * ratePerDay * effort;

    return {
      ...row,
      durationDays,
      count,
      allocationPercent,
      ratePerDay,
      effort,
      plannedEffort,
      plannedCost,
    };
  });
  const baseResourceCost = displayRows.reduce((sum, row) => sum + parseNumber(row.plannedCost, 0), 0);
  const planned_effort = displayRows.reduce((sum, row) => sum + parseNumber(row.plannedEffort, 0), 0);
  const estimated_team_size = displayRows.reduce((sum, row) => sum + parseNumber(row.count, 0), 0);
  const managementReservePercent = parseNumber(financial.management_reserve_percent, 0);
  const contingencyReservePercent = parseNumber(financial.contingency_reserve_percent, 0);

  return {
    rows: displayRows,
    baseResourceCost,
    planned_effort,
    estimated_team_size,
    budget: baseResourceCost * (1 + (managementReservePercent + contingencyReservePercent) / 100),
  };
};

const ProjectDetails = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [workflowHistory, setWorkflowHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const loadProject = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getProject(projectId);
      setProject(data.project);
      setWorkflowHistory(data.workflowHistory || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleWorkflowAction = async (action, comment) => {
    setActionLoading(true);
    try {
      const result = await transitionProject(projectId, action, comment);
      setWorkflowHistory(result.workflowHistory || []);
      setProject((current) => ({
        ...current,
        workflowStatus: result.transition.toStatus,
        status: result.transition.toStatus,
        latestComment: result.transition.latestComment,
      }));
      if (result.transition.publishedProjectId) {
        navigate(`/projects/view/${result.transition.publishedProjectId}`);
      }
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

  if (!project) {
    return <CAlert color="danger">{error || 'Project not found'}</CAlert>;
  }

  const role = authService.getUserRole();
  const status = String(project.workflowStatus || project.status || 'DRAFT').toUpperCase();
  const isPm = String(role || '').toUpperCase() === 'PM';
  const isEditableForPm = isPm && ['DRAFT', 'RETURNED'].includes(status);
  const canCreateCr = isPm && status === 'APPROVED';
  const draftData = project.draftData || {};
  const basicInfo = draftData.basicInfo || {};
  const deliveryDetails = draftData.deliveryDetails || {};
  const teamComposition = draftData.teamComposition || {};
  const technology = draftData.technology || {};
  const financial = draftData.financial || {};
  const risks = draftData.risks || {};
  const displayProjectName = basicInfo.project_name || project.name || 'Untitled Project';
  const isAgile = String(basicInfo.delivery_model || '').toLowerCase() === 'agile';
  const displayPlanning = deriveDisplayResourcePlanning(
    Array.isArray(teamComposition.rows) ? teamComposition.rows : [],
    financial,
    deliveryDetails,
  );
  const displayResourceRows = displayPlanning.rows;
  const displayDeliveryBudget = displayPlanning.budget || parseNumber(financial.budget, 0);
  const displayPlannedEffort = displayPlanning.planned_effort || parseNumber(financial.planned_effort || project.estimated_hours, 0);

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <CButton color="secondary" variant="outline" onClick={() => navigate('/projects')}>
              Back to Projects
            </CButton>
            <div>
              <h1 className="page-title mb-1">{displayProjectName}</h1>
              <div className="d-flex gap-2 align-items-center flex-wrap">
                <p className="text-muted mb-0">Project ID: {project.projectId}</p>
                <CBadge color={statusColors[status] || 'secondary'}>{status}</CBadge>
              </div>
            </div>
          </div>
        </CCol>
      </CRow>

      {error && <CAlert color="danger">{error}</CAlert>}
      {isEditableForPm && (
        <CAlert color={status === 'REJECTED' ? 'danger' : 'warning'}>
          This project can be edited and resubmitted. Review the workflow comments before submitting again.
        </CAlert>
      )}
      {status === 'APPROVED' && (
        <CAlert color="info">
          This approved project is an immutable operational baseline. Future changes must happen through change requests.
        </CAlert>
      )}
      {status === 'COMPLETE' && (
        <CAlert color="success">
          This project is complete. Change requests are locked for this project.
        </CAlert>
      )}

      <CRow>
        <CCol lg={8}>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {isEditableForPm && (
              <CButton color="primary" onClick={() => navigate(`/projects/edit/${project.projectId}`)}>
                Edit and Resubmit
              </CButton>
            )}
            {canCreateCr && (
              <CButton color="primary" variant="outline" onClick={() => navigate(`/crs/create?projectId=${project.projectId}`)}>
                Add CR
              </CButton>
            )}
          </div>

          <div className="review-summary-grid">
            <CRow>
              <CCol md={6}>
                <h5>Basic Information</h5>
                <DetailItem label="Project" value={displayProjectName} />
                <DetailItem label="Client" value={basicInfo.client_name || project.business_unit} />
                <DetailItem label="Industry" value={basicInfo.industry} />
                <DetailItem label="Project type" value={basicInfo.project_type} />
                <DetailItem label="Delivery model" value={basicInfo.delivery_model} />
                <DetailItem label="Business criticality" value={basicInfo.business_criticality} />
              </CCol>
              <CCol md={6}>
                <h5>Delivery & Timeline</h5>
                <DetailItem label="Start" value={formatDisplayDate(deliveryDetails.start_date)} />
                <DetailItem label="Planned end" value={formatDisplayDate(deliveryDetails.planned_end_date)} />
                <DetailItem label="Sprint length" value={deliveryDetails.sprint_length} />
                <DetailItem label="Frequency" value={deliveryDetails.release_frequency} />
                {!isAgile && <DetailItem label="Milestones" value={deliveryDetails.milestone_count} />}
              </CCol>
            </CRow>
            <CRow>
              <CCol md={12} className="mb-3">
                <h5>Resource Loading</h5>
                {displayResourceRows.length > 0 ? (
                  <div className="table-responsive">
                    <table className="table table-sm mb-3">
                      <thead>
                        <tr>
                          <th>Role</th>
                          <th>Location Type</th>
                          <th>Count</th>
                          <th>Allocation %</th>
                          <th>Start</th>
                          <th>End</th>
                          <th>Rate / Day</th>
                          <th>Effort</th>
                          <th>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayResourceRows.map((row, index) => (
                          <tr key={`${row.role}-${index}`}>
                            <td>{valueOrDash(row.role)}</td>
                            <td>{valueOrDash(row.locationType)}</td>
                            <td>{valueOrDash(row.count)}</td>
                            <td>{valueOrDash(row.allocationPercent)}</td>
                            <td>{formatDisplayDate(row.startDate)}</td>
                            <td>{formatDisplayDate(row.endDate)}</td>
                            <td>{formatCurrency(row.ratePerDay || 0)}</td>
                            <td>{valueOrDash(row.plannedEffort)}</td>
                            <td>{formatCurrency(row.plannedCost || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No roles configured</p>
                )}
              </CCol>
            </CRow>
            <CRow>
              <CCol md={6}>
                <h5>Technology</h5>
                <DetailItem label="Stack" value={technology.technology_stack || project.technology} />
                <DetailItem label="Architecture" value={technology.architecture_type} />
                <DetailItem label="Cloud platform" value={technology.cloud_platform} />
                <DetailItem label="Integrations" value={technology.integration_count} />
                <DetailItem label="External dependencies" value={technology.external_dependencies} />
                <DetailItem label="Complexity" value={technology.complexity || project.complexity} />
              </CCol>
              <CCol md={6}>
                <h5>Financials</h5>
                <DetailItem label="Billing model" value={financial.billing_model} />
                <DetailItem label="Management reserve %" value={financial.management_reserve_percent} />
                <DetailItem label="Contingency reserve %" value={financial.contingency_reserve_percent} />
                <DetailItem label="Derived budget" value={formatCurrency(displayDeliveryBudget)} />
                <DetailItem label="Derived effort" value={displayPlannedEffort} />
                <DetailItem label="Derived team size" value={displayPlanning.estimated_team_size || financial.estimated_team_size || project.team_size} />
                <DetailItem label="Predicted hours" value={project.predicted_hours} />
              </CCol>
            </CRow>
            <CRow>
              <CCol md={12}>
                <h5>Risks</h5>
                <DetailItem label="Dependencies" value={risks.dependency_count} />
                <DetailItem label="Compliance" value={risks.compliance_requirements} />
                <DetailItem label="Criticality" value={risks.criticality} />
                <DetailItem label="Stability index" value={risks.requirement_stability_index} />
                <DetailItem label="Expected CR volatility" value={risks.expected_cr_volatility} />
                <DetailItem label="Risk indicators" value={risks.risk_level_indicators} />
              </CCol>
            </CRow>
          </div>
        </CCol>
        <CCol lg={4}>
          <WorkflowPanel
            status={project.workflowStatus}
            history={workflowHistory}
            onAction={handleWorkflowAction}
            loading={actionLoading}
            title="Project Workflow"
          />
        </CCol>
      </CRow>
    </div>
  );
};

export default ProjectDetails;
