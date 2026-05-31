import React, { useCallback, useEffect, useState } from 'react';
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
  CSpinner,
  CTooltip,
} from '@coreui/react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import WorkflowPanel from '../components/WorkflowPanel';
import WizardTabs from '../components/projectWizard/WizardTabs';
import { getProject, getProjectForecast, getSimilarHistoricalProjects, transitionProject } from '../services/projectService';
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

const forecastStatusColor = {
  'On Track': 'success',
  'Minor Delay': 'warning',
  'Moderate Delay': 'warning',
  'High Delay Risk': 'danger',
  'Moderate Overrun Risk': 'warning',
  'High Overrun Risk': 'danger',
  'Potential Underspend': 'info',
};

const forecastStatus = (delayDays) => {
  const delay = Number(delayDays || 0);
  if (delay <= 0) return 'On Track';
  if (delay <= 14) return 'Minor Delay';
  if (delay <= 30) return 'Moderate Delay';
  return 'High Delay Risk';
};

const formatDelay = (delayDays) => {
  if (delayDays === null || delayDays === undefined || delayDays === '') return '-';
  const delay = Number(delayDays);
  if (!Number.isFinite(delay)) return '-';
  if (delay <= 0) return `${Math.abs(delay)} Days Early / On Track`;
  return `${delay} Days`;
};

const effortStatus = (variance, plannedEffort) => {
  const planned = Number(plannedEffort || 0);
  const delta = Number(variance || 0);
  if (!Number.isFinite(delta) || planned <= 0) return 'Unavailable';
  const variancePercent = (delta / planned) * 100;
  if (variancePercent < -5) return 'Potential Underspend';
  if (variancePercent <= 5) return 'On Track';
  if (variancePercent <= 20) return 'Moderate Overrun Risk';
  return 'High Overrun Risk';
};

const formatEffortVariance = (variance) => {
  if (variance === null || variance === undefined || variance === '') return '-';
  const value = Number(variance);
  if (!Number.isFinite(value)) return '-';
  return `${value > 0 ? '+' : ''}${value} PD`;
};

const formatBudgetVariance = (variance) => {
  if (variance === null || variance === undefined || variance === '') return '-';
  const value = Number(variance);
  if (!Number.isFinite(value)) return '-';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatCurrency(Math.abs(value))}`;
};

const formatSignedDays = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${numeric > 0 ? '+' : ''}${numeric} Days`;
};

const formatSignedPercent = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${numeric > 0 ? '+' : ''}${Math.round(numeric)}%`;
};

const trendIndicator = (status) => {
  if (['Deteriorating', 'Increasing'].includes(status)) return '▲';
  if (['Improving', 'Decreasing'].includes(status)) return '▼';
  return '▬';
};

const trendColor = (status) => {
  if (status === 'Deteriorating' || status === 'High Overrun Risk') return 'danger';
  if (status === 'Increasing') return 'warning';
  if (status === 'Improving' || status === 'Decreasing') return 'success';
  return 'secondary';
};

const averageConfidence = (...forecasts) => {
  const values = forecasts
    .filter((item) => item?.forecastAvailable && Number.isFinite(Number(item.confidence)))
    .map((item) => Number(item.confidence));
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

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
  const [forecast, setForecast] = useState(null);
  const [similarProjects, setSimilarProjects] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [workflowNotice, setWorkflowNotice] = useState(location.state?.workflowNotice || '');
  const [activeDetailTab, setActiveDetailTab] = useState(0);

  const loadProject = useCallback(async () => {
    try {
      setLoading(true);
      const [data, forecastResult, similarResult] = await Promise.all([
        getProject(projectId),
        getProjectForecast(projectId).catch((err) => ({
          forecastAvailable: false,
          message: err.message || 'Forecast is currently unavailable.',
        })),
        getSimilarHistoricalProjects(projectId).catch((err) => ({
          similarProjects: [],
          message: err.message || 'Similar historical projects are currently unavailable.',
        })),
      ]);
      setProject(data.project);
      setWorkflowHistory(data.workflowHistory || []);
      setForecast(forecastResult);
      setSimilarProjects(similarResult);
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
  const canCaptureProgress = isPm && status === 'APPROVED';
  const canCompleteProject = isPm && status === 'APPROVED';
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
            {canCaptureProgress && (
              <CButton color="info" variant="outline" onClick={() => navigate(`/progress/${project.projectId}`)}>
                Capture Progress
              </CButton>
            )}
            {canCompleteProject && (
              <CButton color="success" variant="outline" onClick={() => navigate(`/projects/complete/${project.projectId}`)}>
                Complete Project
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
          <ForecastingCard
            forecast={forecast}
            plannedCompletionDate={deliveryDetails.planned_end_date}
            plannedEffort={displayPlannedEffort}
            plannedBudget={displayDeliveryBudget}
          />
          <SimilarHistoricalProjectsCard result={similarProjects} />
        </CCol>
      </CRow>
    </div>
  );
};

const SimilarHistoricalProjectsCard = ({ result }) => {
  const [expandedId, setExpandedId] = useState(null);
  const projects = Array.isArray(result?.similarProjects) ? result.similarProjects : [];

  return (
    <CCard className="mt-3">
      <CCardHeader className="d-flex justify-content-between align-items-center gap-2">
        <strong>Similar Historical Projects</strong>
        <CTooltip
          content="Similarity is determined using industry, technology, complexity, effort, budget, team size, duration, CR history, and progress behavior. Higher percentages indicate stronger similarity."
        >
          <span className="text-muted small" aria-label="How Similarity Is Calculated">i</span>
        </CTooltip>
      </CCardHeader>
      <CCardBody>
        {projects.length ? projects.map((item) => {
          const expanded = Number(expandedId) === Number(item.projectId);
          return (
            <div key={item.projectId} className="border-bottom pb-3 mb-3">
              <div className="d-flex justify-content-between align-items-start gap-2">
                <div>
                  <div className="fw-semibold">{item.projectName || `Project ${item.projectId}`}</div>
                  <div className="text-muted small">{valueOrDash(item.industry)} - {valueOrDash(item.technology)}</div>
                </div>
                <CBadge color="info">{Math.round(Number(item.similarity || 0))}% Match</CBadge>
              </div>
              <div className="mt-2">
                <DetailItem label="Actual Effort" value={`${valueOrDash(item.actualEffort)} PD`} />
                <DetailItem label="Actual Budget" value={formatCurrency(item.actualBudget || 0)} />
                <DetailItem label="Actual Duration" value={`${valueOrDash(item.actualDurationDays)} Days`} />
              </div>
              <CButton
                color="secondary"
                variant="outline"
                size="sm"
                onClick={() => setExpandedId(expanded ? null : item.projectId)}
              >
                {expanded ? 'Hide Details' : 'Show Details'}
              </CButton>
              {expanded && (
                <div className="mt-3">
                  <DetailItem label="Planned Effort" value={`${valueOrDash(item.plannedEffort)} PD`} />
                  <DetailItem label="Planned Budget" value={formatCurrency(item.plannedBudget || 0)} />
                  <DetailItem label="Planned Duration" value={`${valueOrDash(item.plannedDurationDays)} Days`} />
                  <DetailItem label="Approved CR Count" value={item.approvedCrCount} />
                  <DetailItem label="CR Effort Impact" value={`${valueOrDash(item.totalCrEffortImpact)} PD`} />
                  <DetailItem label="CR Budget Impact" value={formatCurrency(item.totalCrBudgetImpact || 0)} />
                  <DetailItem label="CR Duration Impact" value={`${valueOrDash(item.totalCrDurationImpact)} Days`} />
                </div>
              )}
            </div>
          );
        }) : (
          <CAlert color="info" className="mb-0">
            {result?.message || 'No completed historical projects are available for similarity analysis.'}
          </CAlert>
        )}
      </CCardBody>
    </CCard>
  );
};

const ForecastingCard = ({ forecast, plannedCompletionDate, plannedEffort, plannedBudget }) => {
  const [showHistory, setShowHistory] = useState(false);
  const completionForecast = forecast?.completionDate || forecast;
  const finalEffortForecast = forecast?.finalEffort;
  const finalBudgetForecast = forecast?.finalBudget;
  const trend = forecast?.trend || {};
  const history = Array.isArray(forecast?.history) ? forecast.history : [];
  const status = completionForecast?.forecastAvailable ? forecastStatus(completionForecast.forecastDelayDays) : 'Unavailable';
  const finalEffortStatus = finalEffortForecast?.forecastAvailable
    ? effortStatus(finalEffortForecast.forecastVariance, finalEffortForecast.currentPlannedEffort || plannedEffort)
    : 'Unavailable';
  const finalBudgetStatus = finalBudgetForecast?.forecastAvailable
    ? effortStatus(finalBudgetForecast.forecastVariance, finalBudgetForecast.currentPlannedBudget || plannedBudget)
    : 'Unavailable';
  const combinedConfidence = averageConfidence(completionForecast, finalEffortForecast, finalBudgetForecast);
  return (
    <CCard className="mt-3">
      <CCardHeader>
        <strong>Forecasting</strong>
      </CCardHeader>
      <CCardBody>
        <h6>Schedule Forecast</h6>
        <DetailItem label="Planned Completion" value={formatDisplayDate(completionForecast?.plannedCompletionDate || plannedCompletionDate)} />
        {completionForecast?.forecastAvailable ? (
          <>
            <DetailItem label="Forecast Completion" value={formatDisplayDate(completionForecast.forecastCompletionDate)} />
            <DetailItem label="Expected Delay" value={formatDelay(completionForecast.forecastDelayDays)} />
            <p>
              <strong>Status:</strong>{' '}
              <CBadge color={forecastStatusColor[status] || 'secondary'}>{status}</CBadge>
            </p>
          </>
        ) : (
          <CAlert color="warning">
            {completionForecast?.message || 'Insufficient historical project data available for forecasting.'}
          </CAlert>
        )}
        <hr />
        <h6>Effort Forecast</h6>
        <DetailItem label="Planned Effort" value={`${finalEffortForecast?.currentPlannedEffort ?? plannedEffort ?? '-'} PD`} />
        {finalEffortForecast?.forecastAvailable ? (
          <>
            <DetailItem label="Forecast Final Effort" value={`${finalEffortForecast.forecastFinalEffort} PD`} />
            <DetailItem label="Variance" value={formatEffortVariance(finalEffortForecast.forecastVariance)} />
            <p>
              <strong>Status:</strong>{' '}
              <CBadge color={forecastStatusColor[finalEffortStatus] || 'secondary'}>{finalEffortStatus}</CBadge>
            </p>
          </>
        ) : (
          <CAlert color="warning" className="mb-0">
            {finalEffortForecast?.message || 'Insufficient historical project data available for final effort forecasting.'}
          </CAlert>
        )}
        <hr />
        <h6>Budget Forecast</h6>
        <DetailItem label="Planned Budget" value={formatCurrency(finalBudgetForecast?.currentPlannedBudget ?? plannedBudget ?? 0)} />
        {finalBudgetForecast?.forecastAvailable ? (
          <>
            <DetailItem label="Forecast Final Budget" value={formatCurrency(finalBudgetForecast.forecastFinalBudget)} />
            <DetailItem label="Variance" value={formatBudgetVariance(finalBudgetForecast.forecastVariance)} />
            <p>
              <strong>Status:</strong>{' '}
              <CBadge color={forecastStatusColor[finalBudgetStatus] || 'secondary'}>{finalBudgetStatus}</CBadge>
            </p>
          </>
        ) : (
          <CAlert color="warning" className="mb-0">
            {finalBudgetForecast?.message || 'Insufficient historical project data available for final budget forecasting.'}
          </CAlert>
        )}
        <hr />
        <h6>Forecast Confidence</h6>
        <DetailItem label="Overall Confidence" value={combinedConfidence === null ? '-' : `${combinedConfidence}%`} />
        <DetailItem label="Schedule Confidence" value={completionForecast?.forecastAvailable ? `${completionForecast.confidence}%` : '-'} />
        <DetailItem label="Effort Confidence" value={finalEffortForecast?.forecastAvailable ? `${finalEffortForecast.confidence}%` : '-'} />
        <DetailItem label="Budget Confidence" value={finalBudgetForecast?.forecastAvailable ? `${finalBudgetForecast.confidence}%` : '-'} />
        <hr />
        <h6>Forecast Trend</h6>
        {trend.hasPreviousForecast ? (
          <>
            <TrendLine
              label="Schedule"
              value={formatSignedDays(trend.schedule?.deltaDays)}
              status={trend.schedule?.status}
            />
            <TrendLine
              label="Effort"
              value={formatEffortVariance(trend.effort?.delta)}
              status={trend.effort?.status}
            />
            <TrendLine
              label="Budget"
              value={formatBudgetVariance(trend.budget?.delta)}
              status={trend.budget?.status}
            />
            <TrendLine
              label="Confidence"
              value={formatSignedPercent(trend.confidence?.delta)}
              status={trend.confidence?.status}
            />
          </>
        ) : (
          <CAlert color="info" className="mb-0">
            No previous forecast snapshot is available yet.
          </CAlert>
        )}
        <hr />
        <div className="d-flex justify-content-between align-items-center gap-2 mb-2">
          <h6 className="mb-0">Forecast History</h6>
          <CButton color="secondary" variant="outline" size="sm" onClick={() => setShowHistory((value) => !value)}>
            {showHistory ? 'Hide' : 'Show'}
          </CButton>
        </div>
        {showHistory && (
          history.length > 0 ? (
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Completion</th>
                    <th>Effort</th>
                    <th>Budget</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.snapshotId}>
                      <td>{formatDisplayDate(item.snapshotDate)}</td>
                      <td>{formatDisplayDate(item.forecastCompletionDate)}</td>
                      <td>{item.forecastFinalEffort === null ? '-' : `${item.forecastFinalEffort} PD`}</td>
                      <td>{item.forecastFinalBudget === null ? '-' : formatCurrency(item.forecastFinalBudget)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CAlert color="info" className="mb-0">No forecast history is available.</CAlert>
          )
        )}
      </CCardBody>
    </CCard>
  );
};

const TrendLine = ({ label, value, status }) => (
  <p>
    <strong>{label}:</strong>{' '}
    {valueOrDash(value)}{' '}
    <CBadge color={trendColor(status)}>
      {trendIndicator(status)} {status || 'Stable'}
    </CBadge>
  </p>
);

export default ProjectDetails;
