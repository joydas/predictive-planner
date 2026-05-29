import React, { useEffect, useMemo, useState } from 'react';
import { CAlert } from '@coreui/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import authService from '../../services/authService';
import CRWizard from '../../components/crWizard/CRWizard';
import { getChangeRequest } from '../../services/crService';
import { listProjectsAvailableForCr } from '../../services/projectService';
import '../../styles/projectWizard.css';

const CreateCRPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentRole = String(authService.getUserRole() || '').toUpperCase();
  const isAccountManager = ['ACCOUNT_MANAGER', 'AM'].includes(currentRole);
  const projectId = searchParams.get('projectId') || '';
  const crId = searchParams.get('crId');
  const [projects, setProjects] = useState([]);
  const [initialCr, setInitialCr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      listProjectsAvailableForCr(),
      crId ? getChangeRequest(crId) : Promise.resolve(null),
    ])
      .then(([projectResult, crResult]) => {
        if (!active) return;
        setProjects(projectResult.items || []);
        setInitialCr(crResult?.changeRequest || null);
        setLoadError('');
      })
      .catch((error) => {
        if (active) setLoadError(error.message || 'Unable to load CR form');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [crId, isAccountManager, navigate]);

  useEffect(() => {
    if (isAccountManager) {
      navigate('/crs', { replace: true });
    }
  }, [isAccountManager, navigate]);

  const effectiveProjectId = useMemo(() => initialCr?.projectId || projectId, [initialCr, projectId]);
  const effectiveProjects = useMemo(() => {
    if (!initialCr?.projectId || projects.some((project) => Number(project.projectId) === Number(initialCr.projectId))) {
      return projects;
    }

    return [
      ...projects,
      {
        projectId: initialCr.projectId,
        projectCode: initialCr.projectCode,
        projectName: initialCr.projectName,
        canEdit: true,
      },
    ];
  }, [initialCr, projects]);

  const handleSubmitted = ({ crId: submittedCrId, message }) => {
    navigate(`/crs/${submittedCrId}`, {
      replace: true,
      state: {
        workflowNotice: message || 'Change request submitted successfully.',
      },
    });
  };

  if (isAccountManager) {
    return null;
  }

  return (
    <div className="project-wizard-page">
      <div className="project-wizard-header">
        <h1>{crId ? 'Edit Change Request' : 'Create Change Request'}</h1>
        <p>Capture project-linked CR impact details for review.</p>
      </div>
      {loadError && <CAlert color="danger">{loadError}</CAlert>}
      {!loadError && !loading && projects.length === 0 && (
        <CAlert color="warning">No active projects are available for CR creation.</CAlert>
      )}
      <CRWizard
        loading={loading}
        projects={effectiveProjects}
        initialCr={initialCr}
        projectId={effectiveProjectId}
        onSubmitted={handleSubmitted}
      />
    </div>
  );
};

export default CreateCRPage;
