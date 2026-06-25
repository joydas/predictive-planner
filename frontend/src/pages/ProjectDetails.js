import React, { useCallback, useEffect, useState } from 'react';
import {
  CAlert,
  CButton,
  CCol,
  CRow,
  CSpinner,
} from '@coreui/react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import WorkflowPanel from '../components/WorkflowPanel';
import { 
  getProject, 
  getProjectForecast, 
  getSimilarHistoricalProjects, 
  transitionProject,
  getProjectProgress,
  getTeamRecommendation
} from '../services/projectService';
import { getProjectChangeRequests } from '../services/crService';
import authService from '../services/authService';
import { formatCurrency, parseNumber, deriveDisplayResourcePlanning } from '../utils/resourcePlanning';
import '../styles/projectWizard.css';
import '../styles/projectDetailsModern.css';

// New Sub-components
import KpiRibbon from './project/details/KpiRibbon';
import ProjectOverview from './project/details/ProjectOverview';
import AiInsights from './project/details/AiInsights';
import TeamSection from './project/details/TeamSection';
import ChangeRequestsSection from './project/details/ChangeRequestsSection';
import ProgressHistorySection from './project/details/ProgressHistorySection';
import SimilarProjectsSection from './project/details/SimilarProjectsSection';

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
  if (delay <= 50) return 'Moderate Delay';
  return 'High Delay Risk';
};

const ProjectDetails = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState(null);
  const [workflowHistory, setWorkflowHistory] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [similarProjects, setSimilarProjects] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [crs, setCrs] = useState([]);
  const [progress, setProgress] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [workflowNotice, setWorkflowNotice] = useState(location.state?.workflowNotice || '');

  const loadProject = useCallback(async () => {
    try {
      setLoading(true);
      const [
        projectData, 
        forecastResult, 
        similarResult, 
        recommendationResult, 
        crResult,
        progressResult
      ] = await Promise.all([
        getProject(projectId),
        getProjectForecast(projectId).catch(() => ({ forecastAvailable: false })),
        getSimilarHistoricalProjects(projectId).catch(() => ({ similarProjects: [] })),
        getTeamRecommendation(projectId).catch(() => null),
        getProjectChangeRequests(projectId).catch(() => ({ changeRequests: [] })),
        getProjectProgress(projectId).catch(() => ({ snapshots: [] }))
      ]);

      setProject(projectData.project);
      setWorkflowHistory(projectData.workflowHistory || []);
      setForecast(forecastResult);
      setSimilarProjects(similarResult);
      setRecommendation(recommendationResult);
      setCrs(crResult.changeRequests || crResult || []);
      setProgress(progressResult);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load project details');
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
    const timeoutId = window.setTimeout(() => setWorkflowNotice(''), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [workflowNotice]);

  const handleWorkflowAction = async (action, comment) => {
    setActionLoading(true);
    try {
      const result = await transitionProject(projectId, action, comment);
      if (result.transition?.publishedProjectId) {
        navigate(`/projects/view/${result.transition.publishedProjectId}`, {
          state: { workflowNotice: 'Project approved and latest baseline loaded.' },
        });
        return;
      }
      await loadProject();
      setWorkflowNotice(action === 'submit' ? 'Project submitted successfully.' : 'Workflow action completed.');
    } catch (err) {
      setError(err.message || 'Workflow transition failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="text-center py-5"><CSpinner /></div>;
  if (!project) return <CAlert color="danger">{error || 'Project not found'}</CAlert>;

  const role = authService.getUserRole();
  const rawStatus = String(project.workflowStatus || project.status || 'DRAFT').toUpperCase();
  const status = rawStatus === 'COMPLETE' ? 'COMPLETED' : rawStatus;
  const isPm = String(role || '').toUpperCase() === 'PM';
  const isEditableForPm = isPm && ['DRAFT', 'RETURNED', 'REJECTED'].includes(status);
  const canCreateCr = isPm && status === 'APPROVED';
  const canCaptureProgress = isPm && status === 'APPROVED';
  const canCompleteProject = isPm && status === 'APPROVED';

  const draftData = project.draftData || {};
  const basicInfoDraft = draftData.basicInfo || {};
  const basicInfo = {
    project_name: project.name || basicInfoDraft.project_name || 'Untitled Project',
    client_name: project.business_unit || project.clientName || basicInfoDraft.client_name || '',
    industry: project.industry || basicInfoDraft.industry || '',
    industry_code: project.industryCode || basicInfoDraft.industry_code || '',
    delivery_model: project.delivery_model || project.deliveryModel || basicInfoDraft.delivery_model || '',
    business_criticality: project.business_criticality || project.businessCriticality || basicInfoDraft.business_criticality || '',
    pm_estimated_value: project.pm_estimated_value || project.pmEstimatedValue || basicInfoDraft.pm_estimated_value || '',
  };
  const deliveryDetails = {
    start_date: project.startDate || project.deliveryDetails?.start_date || basicInfoDraft.start_date || '',
    planned_end_date: project.plannedEndDate || project.deliveryDetails?.planned_end_date || basicInfoDraft.planned_end_date || '',
  };
  const teamComposition = draftData.teamComposition || {};
  const technologyDraft = draftData.technology || {};
  const technology = {
    ...technologyDraft,
    technology_stack: project.technology?.technology_stack || project.technologyStack || technologyDraft.technology_stack || '',
    architecture_type: project.technology?.architecture_type || project.architecture_type || project.architectureType || technologyDraft.architecture_type || '',
    cloud_platform: project.technology?.cloud_platform || project.cloud_platform || project.cloudPlatform || technologyDraft.cloud_platform || '',
    complexity: project.complexity ?? project.technology?.complexity ?? technologyDraft.complexity ?? 0,
  };
  const financial = {
    ...(draftData.financial || {}),
    estimated_team_size: project.estimatedTeamSize || project.team_size || (draftData.financial || {}).estimated_team_size || 0,
    planned_effort: project.plannedEffort || project.estimated_hours || (draftData.financial || {}).planned_effort || 0,
    budget: project.budget || (draftData.financial || {}).budget || 0,
    billing_model: project.billing_model || project.billingModel || (draftData.financial || {}).billing_model || '',
  };
  const risks = draftData.risks || {};
  const estimation = project.baselineTracking?.estimation || {};

  const displayPlanning = deriveDisplayResourcePlanning(
    Array.isArray(teamComposition.rows) ? teamComposition.rows : [],
    financial,
    deliveryDetails,
  );

  const displayProjectName = project.name || basicInfo.project_name || 'Untitled Project';
  const displayBudget = displayPlanning.budget || parseNumber(financial.budget, 0) || parseNumber(project.budget, 0) || 0;
  const displayEffort = displayPlanning.planned_effort || parseNumber(financial.planned_effort || project.plannedEffort || project.estimated_hours, 0);
  const completionPercent = progress?.latestSnapshot?.actualCompletionPercent || 0;
  
  const completionForecast = forecast?.completionDate || forecast;
  const fStatus = completionForecast?.forecastAvailable ? forecastStatus(completionForecast.forecastDelayDays) : 'Unavailable';

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
            <div className="d-flex align-items-center gap-3">
              <CButton color="secondary" variant="outline" onClick={() => navigate('/projects')}>
                Back
              </CButton>
              <h1 className="page-title mb-0">{displayProjectName}</h1>
            </div>
            <div className="d-flex gap-2">
              {isEditableForPm && (
                <CButton color="primary" onClick={() => navigate(`/projects/edit/${project.projectId}`)}>
                  Edit
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
                  Complete
                </CButton>
              )}
            </div>
          </div>
        </CCol>
      </CRow>

      {workflowNotice && <CAlert color="success">{workflowNotice}</CAlert>}
      {error && <CAlert color="danger">{error}</CAlert>}

      <KpiRibbon 
        projectName={displayProjectName}
        status={status}
        technology={technology.technology_stack || project.technology}
        budget={formatCurrency(displayBudget)}
        effort={`${displayEffort} PD`}
        teamSize={displayPlanning.estimated_team_size || financial.estimated_team_size || project.team_size}
        completion={`${completionPercent}%`}
        forecastStatus={fStatus}
        forecastStatusColor={forecastStatusColor[fStatus] || 'secondary'}
      />

      <CRow>
        <CCol lg={12}>
          <AiInsights projectId={projectId} />

          <ProjectOverview 
            project={project}
            basicInfo={basicInfo}
            deliveryDetails={deliveryDetails}
            technology={technology}
            risks={risks}
            financial={financial}
            estimation={estimation}
          />

          <TeamSection teamRows={displayPlanning.rows} />

          <ChangeRequestsSection crs={crs} />
          
          <ProgressHistorySection snapshots={progress?.snapshots} />

          <SimilarProjectsSection projects={similarProjects?.similarProjects} />
        </CCol>

        
      </CRow>
      <CRow>
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
