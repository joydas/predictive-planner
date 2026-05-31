import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ProjectWizardProvider } from '../../context/projectWizard.context';
import authService from '../../services/authService';
import { getDraft } from '../../services/projectService';
import ProjectWizard from '../../components/projectWizard/ProjectWizard';
import '../../styles/projectWizard.css';

const parseDraftData = (draftData) => {
  if (!draftData) return {};
  if (typeof draftData === 'object') return draftData;
  if (typeof draftData === 'string') {
    try {
      return JSON.parse(draftData);
    } catch {
      return {};
    }
  }
  return {};
};

const CreateProjectPage = () => {
  const { draftId: routeDraftId } = useParams();
  const [searchParams] = useSearchParams();
  const [initialDraft, setInitialDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const draftId = routeDraftId || searchParams.get('draftId');
    if (!draftId) return;

    setLoading(true);
    getDraft(draftId)
      .then((result) => {
        setInitialDraft({ draftId: result.draft.draftId, ...parseDraftData(result.draft.draftData) });
      })
      .catch((error) => {
        setLoadError(error.message || 'Unable to load draft');
      })
      .finally(() => setLoading(false));
  }, [routeDraftId, searchParams]);

  const navigate = useNavigate();
  const currentRole = String(authService.getUserRole() || '').toUpperCase();
  const isAccountManager = ['ACCOUNT_MANAGER', 'AM'].includes(currentRole);

  useEffect(() => {
    if (isAccountManager) {
      navigate('/projects', { replace: true });
    }
  }, [isAccountManager, navigate]);

  const mode = routeDraftId || searchParams.get('draftId') ? 'edit' : 'create';
  const title = mode === 'edit' ? 'Edit Project' : 'Create Project';

  const handleSubmitted = ({ projectId, message }) => {
    navigate(`/projects/view/${projectId}`, {
      replace: true,
      state: {
        workflowNotice: message || 'Project submitted successfully.',
      },
    });
  };

  if (isAccountManager) {
    return null;
  }

  return (
    <div className="project-wizard-page">
      <div className="project-wizard-header">
        <h1>{title}</h1>
        <p>{mode === 'edit' ? 'Update returned project draft details before resubmission.' : 'Build new project metadata in a structured multi-step flow.'}</p>
      </div>
      {loadError && <div className="alert alert-danger">{loadError}</div>}
      <ProjectWizardProvider initialDraft={initialDraft}>
        <ProjectWizard loading={loading} mode={mode} onSubmitted={handleSubmitted} />
      </ProjectWizardProvider>
    </div>
  );
};

export default CreateProjectPage;
