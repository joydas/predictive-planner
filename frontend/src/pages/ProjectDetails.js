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
import '../styles/projectWizard.css';

const statusColors = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  RETURNED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

const valueOrDash = (value) => (value === null || value === undefined || value === '' ? '-' : value);

const DetailItem = ({ label, value }) => (
  <p><strong>{label}:</strong> {valueOrDash(value)}</p>
);

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
              </CCol>
              <CCol md={6}>
                <h5>Delivery Details</h5>
                <DetailItem label="Start" value={deliveryDetails.start_date} />
                <DetailItem label="Planned end" value={deliveryDetails.planned_end_date} />
                <DetailItem label="Sprint length" value={deliveryDetails.sprint_length} />
                <DetailItem label="Frequency" value={deliveryDetails.release_frequency} />
              </CCol>
            </CRow>
            <CRow>
              <CCol md={12} className="mb-3">
                <h5>Team Composition</h5>
                {Array.isArray(teamComposition.rows) && teamComposition.rows.length > 0 ? (
                  <div className="table-responsive">
                    <table className="table table-sm mb-3">
                      <thead>
                        <tr>
                          <th>Role</th>
                          <th>Count</th>
                          <th>Avg Experience</th>
                          <th>Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamComposition.rows.map((row, index) => (
                          <tr key={`${row.role}-${index}`}>
                            <td>{valueOrDash(row.role)}</td>
                            <td>{valueOrDash(row.count)}</td>
                            <td>{valueOrDash(row.avgExperience)}</td>
                            <td>{valueOrDash(row.location)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No roles configured</p>
                )}
                <DetailItem label="Locations" value={teamComposition.locations} />
                <DetailItem label="Offshore/Onshore" value={teamComposition.offshoreOnshoreRatio} />
              </CCol>
            </CRow>
            <CRow>
              <CCol md={6}>
                <h5>Technology</h5>
                <DetailItem label="Stack" value={technology.technology_stack || project.technology} />
                <DetailItem label="Architecture" value={technology.architecture_type} />
                <DetailItem label="Cloud platform" value={technology.cloud_platform} />
                <DetailItem label="Integrations" value={technology.integration_count} />
                <DetailItem label="Complexity" value={technology.complexity || project.complexity} />
              </CCol>
              <CCol md={6}>
                <h5>Financials</h5>
                <DetailItem label="Budget" value={financial.budget} />
                <DetailItem label="Planned effort" value={financial.planned_effort || project.estimated_hours} />
                <DetailItem label="Estimated team size" value={financial.estimated_team_size || project.team_size} />
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
