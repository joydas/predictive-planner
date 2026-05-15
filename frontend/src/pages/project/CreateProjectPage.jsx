import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProjectWizardProvider } from '../../context/projectWizard.context';
import { getDraft } from '../../services/projectService';
import ProjectWizard from '../../components/projectWizard/ProjectWizard';
import '../../styles/projectWizard.css';

const CreateProjectPage = () => {
  const [searchParams] = useSearchParams();
  const [initialDraft, setInitialDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const draftId = searchParams.get('draftId');
    if (!draftId) return;

    setLoading(true);
    getDraft(draftId)
      .then((result) => {
        setInitialDraft({ draftId: result.draft.draftId, ...result.draft.draftData });
      })
      .catch((error) => {
        setLoadError(error.message || 'Unable to load draft');
      })
      .finally(() => setLoading(false));
  }, [searchParams]);

  return (
    <div className="project-wizard-page">
      <div className="project-wizard-header">
        <h1>Create Project Wizard</h1>
        <p>Build new project metadata in a structured multi-step flow.</p>
      </div>
      {loadError && <div className="alert alert-danger">{loadError}</div>}
      <ProjectWizardProvider initialDraft={initialDraft}>
        <ProjectWizard loading={loading} />
      </ProjectWizardProvider>
    </div>
  );
};

export default CreateProjectPage;
