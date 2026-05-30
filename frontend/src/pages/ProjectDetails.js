import React, { useCallback, useEffect, useState } from 'react';
import {
  CAlert,
  CBadge,
  CButton,
  CCol,
  CRow,
  CSpinner,
} from '@coreui/react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import WorkflowPanel from '../components/WorkflowPanel';
import WizardTabs from '../components/projectWizard/WizardTabs';
import { getProject, transitionProject } from '../services/projectService';
import authService from '../services/authService';
import { formatDisplayDate } from '../utils/dateUtils';
import { formatCurrency, getWorkingDays, parseNumber } from '../utils/resourcePlanning';
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

const detailTabs = [
  { key: 'projectInformation', label: 'Project Information' },
  { key: 'resourceLoading', label: 'Resource Loading and Planning' },
  { key: 'review', label: 'Review & Submit' },
];

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
    const workingDays = getWorkingDays(row.startDate, row.endDate);
    const plannedEffort = count * allocationMultiplier * workingDays;
    const plannedCost = plannedEffort * ratePerDay;

    return {
      ...row,
      durationDays: workingDays,
      workingDays,
      count,
      allocationPercent,
      ratePerDay,
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
  const location = useLocation();
  const [project, setProject] = useState(null);
  const [workflowHistory, setWorkflowHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [workflowNotice, setWorkflowNotice] = useState(location.state?.workflowNotice || '');
  const [activeDetailTab, setActiveDetailTab] = useState(0);

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
      const result = await transitionProject(projectId, action, comment);
      if (result.transition.publishedProjectId) {
        navigate(`/projects/view/${result.transition.publishedProjectId}`, {
          state: { workflowNotice: 'Project approved and latest baseline loaded.' },
        });
        return;
      }
      await loadProject();
      setWorkflowNotice(action === 'submit' ? 'Project submitted successfully. Latest workflow state loaded.' : 'Workflow action completed. Latest project state loaded.');
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
  const estimation = project.baselineTracking?.estimation || {};

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

      {workflowNotice && <CAlert color="success">{workflowNotice}</CAlert>}
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

          <WizardTabs steps={detailTabs} currentStep={activeDetailTab} onSelect={setActiveDetailTab} />

          <div className="review-summary-grid project-information-panel">
            {activeDetailTab === 0 && (
              <>
                <div className="project-info-section">
                  <h5 className="project-info-section-heading">Basic Information</h5>
                  <CRow>
                    <CCol md={6}>
                      <DetailItem label="Project" value={displayProjectName} />
                      <DetailItem label="Client" value={basicInfo.client_name || project.business_unit} />
                      <DetailItem label="Industry" value={basicInfo.industry} />
                      <DetailItem label="Project type" value={basicInfo.project_type} />
                    </CCol>
                    <CCol md={6}>
                      <DetailItem label="Delivery model" value={basicInfo.delivery_model} />
                      <DetailItem label="Business criticality" value={basicInfo.business_criticality} />
                      <DetailItem label="PM estimated value (PD)" value={basicInfo.pm_estimated_value || estimation.pmEstimatedValue} />
                    </CCol>
                  </CRow>
                </div>
                <div className="project-info-section">
                  <h5 className="project-info-section-heading">Delivery & Timeline</h5>
                  <CRow>
                    <CCol md={6}>
                      <DetailItem label="Start" value={formatDisplayDate(deliveryDetails.start_date)} />
                      <DetailItem label="Planned end" value={formatDisplayDate(deliveryDetails.planned_end_date)} />
                    </CCol>
                    <CCol md={6}>
                      <DetailItem label="Sprint length" value={deliveryDetails.sprint_length} />
                      <DetailItem label="Frequency" value={deliveryDetails.release_frequency} />
                      {!isAgile && <DetailItem label="Milestones" value={deliveryDetails.milestone_count} />}
                    </CCol>
                  </CRow>
                </div>
                <div className="project-info-section">
                  <h5 className="project-info-section-heading">Technology & Architecture</h5>
                  <CRow>
                    <CCol md={6}>
                      <DetailItem label="Stack" value={technology.technology_stack || project.technology} />
                      <DetailItem label="Architecture" value={technology.architecture_type} />
                      <DetailItem label="Cloud platform" value={technology.cloud_platform} />
                    </CCol>
                    <CCol md={6}>
                      <DetailItem label="Integrations" value={technology.integration_count} />
                      <DetailItem label="External dependencies" value={technology.external_dependencies} />
                      <DetailItem label="Complexity" value={technology.complexity || project.complexity} />
                    </CCol>
                  </CRow>
                </div>
                <div className="project-info-section">
                  <h5 className="project-info-section-heading">Risks & Dependencies</h5>
                  <CRow>
                    <CCol md={6}>
                      <DetailItem label="Dependencies" value={risks.dependency_count} />
                      <DetailItem label="Compliance" value={risks.compliance_requirements} />
                      <DetailItem label="Criticality" value={risks.criticality} />
                    </CCol>
                    <CCol md={6}>
                      <DetailItem label="Stability index" value={risks.requirement_stability_index} />
                      <DetailItem label="Expected CR volatility" value={risks.expected_cr_volatility} />
                      <DetailItem label="Risk indicators" value={risks.risk_level_indicators} />
                    </CCol>
                  </CRow>
                </div>
                <div className="project-info-section">
                  <h5 className="project-info-section-heading">Financial Assumptions</h5>
                  <CRow>
                    <CCol md={6}>
                      <DetailItem label="Billing model" value={financial.billing_model} />
                      <DetailItem label="Management reserve %" value={financial.management_reserve_percent} />
                      <DetailItem label="Contingency reserve %" value={financial.contingency_reserve_percent} />
                    </CCol>
                    <CCol md={6}>
                      <DetailItem label="Derived budget" value={formatCurrency(displayDeliveryBudget)} />
                      <DetailItem label="Derived Effort (PD)" value={displayPlannedEffort} />
                      <DetailItem label="Derived team size" value={displayPlanning.estimated_team_size || financial.estimated_team_size || project.team_size} />
                    </CCol>
                  </CRow>
                </div>
              </>
            )}

            {activeDetailTab === 1 && (
              <div className="project-info-section">
                <h5 className="project-info-section-heading">Resource Loading</h5>
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
                          <th>Effort (PD)</th>
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
              </div>
            )}

            {activeDetailTab === 2 && (
              <div className="project-info-section">
                <h5 className="project-info-section-heading">Review & Submit</h5>
                <DetailItem label="Workflow status" value={status} />
                <DetailItem label="PM estimate (PD)" value={estimation.pmEstimatedValue || basicInfo.pm_estimated_value} />
                <DetailItem label="AI estimate (PD)" value={estimation.aiEstimatedValue} />
                <DetailItem label="Actual final estimate (PD)" value={estimation.actualFinalEstimatedValue} />
                <DetailItem label="Approved CR estimation impact (PD)" value={estimation.totalCrEstimationImpact} />
              </div>
            )}
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
