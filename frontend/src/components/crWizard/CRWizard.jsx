import React, { useEffect, useMemo, useState } from 'react';
import { CAlert, CButton, CCard, CCardBody, CCardFooter, CSpinner } from '@coreui/react';
import WizardTabs from '../projectWizard/WizardTabs';
import { createCrDraft, submitCrDraft, updateCrDraft } from '../../services/crService';
import CRBasicInfoStep from './steps/CRBasicInfoStep';
import ImpactAssessmentStep from './steps/ImpactAssessmentStep';
import TeamImpactStep from './steps/TeamImpactStep';
import FinancialImpactStep from './steps/FinancialImpactStep';
import ReviewSubmitStep from './steps/ReviewSubmitStep';

const steps = [
  { key: 'basic', label: 'Basic Information' },
  { key: 'impact', label: 'Impact Assessment' },
  { key: 'teamImpact', label: 'Team Impact' },
  { key: 'financial', label: 'Financial Impact' },
  { key: 'review', label: 'Review & Submit' },
];

const defaultState = {
  crId: null,
  currentStep: 0,
  basic: {
    projectId: '',
    title: '',
    description: '',
    category: '',
    severity: '',
    priority: '',
    affectedModule: '',
  },
  impact: {
    scheduleImpactDays: '',
    estimatedEffortHours: '',
    estimatedCostImpact: '',
    dependencyImpact: '',
    environmentsAffected: '',
  },
  teamImpact: {
    additionalPmCount: '',
    additionalDevCount: '',
    additionalQaCount: '',
    additionalDevOpsCount: '',
    additionalArchitectCount: '',
  },
  financial: {
    additionalBudget: '',
    additionalLicensingCost: '',
    infrastructureCostImpact: '',
  },
};

function buildInitialState(initialCr, projectId) {
  if (!initialCr) {
    return {
      ...defaultState,
      basic: {
        ...defaultState.basic,
        projectId: projectId || '',
      },
    };
  }

  return {
    ...defaultState,
    crId: initialCr.crId,
    basic: {
      projectId: initialCr.projectId || projectId || '',
      title: initialCr.title || '',
      description: initialCr.description || '',
      category: initialCr.category || '',
      severity: initialCr.severity || '',
      priority: initialCr.priority || '',
      affectedModule: initialCr.affectedModule || '',
    },
    impact: {
      scheduleImpactDays: initialCr.scheduleImpactDays ?? '',
      estimatedEffortHours: initialCr.estimatedEffortHours ?? '',
      estimatedCostImpact: initialCr.estimatedCostImpact ?? '',
      dependencyImpact: initialCr.dependencyImpact || '',
      environmentsAffected: initialCr.environmentsAffected || '',
    },
    teamImpact: {
      additionalPmCount: initialCr.additionalPmCount ?? '',
      additionalDevCount: initialCr.additionalDevCount ?? '',
      additionalQaCount: initialCr.additionalQaCount ?? '',
      additionalDevOpsCount: initialCr.additionalDevOpsCount ?? '',
      additionalArchitectCount: initialCr.additionalArchitectCount ?? '',
    },
    financial: {
      additionalBudget: initialCr.additionalBudget ?? '',
      additionalLicensingCost: initialCr.additionalLicensingCost ?? '',
      infrastructureCostImpact: initialCr.infrastructureCostImpact ?? '',
    },
  };
}

const CRWizard = ({ loading, projects, initialCr, projectId, onSubmitted }) => {
  const [state, setState] = useState(() => buildInitialState(initialCr, projectId));
  const [stepErrors, setStepErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitComment, setSubmitComment] = useState('');

  useEffect(() => {
    setState(buildInitialState(initialCr, projectId));
  }, [initialCr, projectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => Number(project.projectId) === Number(state.basic.projectId)),
    [projects, state.basic.projectId],
  );

  const crPayload = useMemo(() => ({
    basic: state.basic,
    impact: state.impact,
    teamImpact: state.teamImpact,
    financial: state.financial,
  }), [state.basic, state.impact, state.teamImpact, state.financial]);

  const updateSection = (section, payload) => {
    setState((current) => ({
      ...current,
      [section]: {
        ...current[section],
        ...payload,
      },
    }));
  };

  const validateStep = () => {
    const errors = {};
    if (state.currentStep === 0 || state.currentStep === steps.length - 1) {
      if (!state.basic.projectId) errors.projectId = 'Project is required';
      if (!state.basic.title.trim()) errors.title = 'CR title is required';
      if (!state.basic.description.trim()) errors.description = 'CR description is required';
      if (!state.basic.category) errors.category = 'CR category is required';
      if (!state.basic.severity) errors.severity = 'Severity is required';
      if (!state.basic.priority) errors.priority = 'Priority is required';
      if (!state.basic.affectedModule.trim()) errors.affectedModule = 'Affected module is required';
    }

    if (state.currentStep === steps.length - 1 && !submitComment.trim()) {
      errors.submitComment = 'PM submit comment is required';
    }

    return errors;
  };

  const saveDraft = async () => {
    const draftErrors = {};
    if (!state.basic.projectId) draftErrors.projectId = 'Project is required';
    if (!state.basic.title.trim()) draftErrors.title = 'CR title is required';
    if (Object.keys(draftErrors).length) {
      setStepErrors(draftErrors);
      return null;
    }

    setSaving(true);
    try {
      if (state.crId) {
        await updateCrDraft(state.crId, crPayload);
        setMessage('CR draft saved.');
        setError('');
        return state.crId;
      }

      const result = await createCrDraft(crPayload);
      setState((current) => ({ ...current, crId: result.crId }));
      setMessage('CR draft saved.');
      setError('');
      return result.crId;
    } catch (err) {
      setError(err.message || 'Unable to save CR draft');
      setMessage('');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const errors = validateStep();
    if (Object.keys(errors).length) {
      setStepErrors(errors);
      return;
    }

    setStepErrors({});
    if (state.currentStep < steps.length - 1) {
      await saveDraft();
      setState((current) => ({ ...current, currentStep: current.currentStep + 1 }));
    }
  };

  const handleSubmit = async () => {
    const errors = validateStep();
    if (Object.keys(errors).length) {
      setStepErrors(errors);
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const crId = state.crId || await saveDraft();
      if (!crId) return;
      const result = await submitCrDraft(crId, crPayload, submitComment.trim());
      setMessage('Change request submitted.');
      onSubmitted?.(result.crId || crId);
    } catch (err) {
      setError(err.message || 'Unable to submit change request');
    } finally {
      setSaving(false);
    }
  };

  const currentStep = state.currentStep;
  const stepComponents = [
    <CRBasicInfoStep
      data={state.basic}
      projects={projects}
      updateSection={(payload) => updateSection('basic', payload)}
      errors={stepErrors}
      readOnlyProject={!!projectId}
    />,
    <ImpactAssessmentStep data={state.impact} updateSection={(payload) => updateSection('impact', payload)} errors={stepErrors} />,
    <TeamImpactStep data={state.teamImpact} updateSection={(payload) => updateSection('teamImpact', payload)} />,
    <FinancialImpactStep data={state.financial} updateSection={(payload) => updateSection('financial', payload)} />,
    <ReviewSubmitStep
      state={state}
      selectedProject={selectedProject}
      submitComment={submitComment}
      onSubmitCommentChange={setSubmitComment}
      commentError={stepErrors.submitComment}
    />,
  ];

  if (loading) {
    return (
      <div className="project-wizard-loading">
        <CSpinner /> Loading change request...
      </div>
    );
  }

  return (
    <CCard className="project-wizard-card">
      <CCardBody>
        <WizardTabs steps={steps} currentStep={currentStep} onSelect={(index) => setState((current) => ({ ...current, currentStep: index }))} />
        {message && <CAlert color="success">{message}</CAlert>}
        {error && <CAlert color="danger">{error}</CAlert>}
        <div className="project-wizard-step-container">{stepComponents[currentStep]}</div>
      </CCardBody>
      <CCardFooter className="project-wizard-footer">
        <div className="wizard-actions">
          <CButton color="secondary" disabled={currentStep === 0 || saving} onClick={() => setState((current) => ({ ...current, currentStep: current.currentStep - 1 }))}>
            Previous
          </CButton>
          <div className="wizard-action-group">
            <CButton color="outline" onClick={saveDraft} disabled={saving}>
              {saving ? 'Saving...' : 'Save Draft'}
            </CButton>
            {currentStep < steps.length - 1 ? (
              <CButton color="primary" onClick={handleNext} disabled={saving}>
                Next
              </CButton>
            ) : (
              <CButton color="success" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Submitting...' : 'Submit CR'}
              </CButton>
            )}
          </div>
        </div>
      </CCardFooter>
    </CCard>
  );
};

export default CRWizard;
