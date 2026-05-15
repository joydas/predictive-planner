import React, { useMemo, useState } from 'react';
import {
  CCard,
  CCardBody,
  CCardFooter,
  CButton,
  CAlert,
  CSpinner,
} from '@coreui/react';
import { useProjectWizard } from '../../context/projectWizard.context';
import { createDraft, updateDraft, submitProject } from '../../services/projectService';
import WizardTabs from './WizardTabs';
import BasicInfoStep from './steps/BasicInfoStep';
import DeliveryDetailsStep from './steps/DeliveryDetailsStep';
import TeamCompositionStep from './steps/TeamCompositionStep';
import TechnologyStep from './steps/TechnologyStep';
import FinancialStep from './steps/FinancialStep';
import RiskStep from './steps/RiskStep';
import ReviewSubmitStep from './steps/ReviewSubmitStep';

const steps = [
  { key: 'basicInfo', label: 'Basic Information' },
  { key: 'deliveryDetails', label: 'Delivery Details' },
  { key: 'teamComposition', label: 'Team Composition' },
  { key: 'technology', label: 'Technology & Architecture' },
  { key: 'financial', label: 'Financials & Planning' },
  { key: 'risks', label: 'Risks & Dependencies' },
  { key: 'review', label: 'Review & Submit' },
];

const ProjectWizard = ({ loading }) => {
  const {
    state,
    setCurrentStep,
    updateSection,
    setTeamRows,
    setDraftId,
    setDraftSaved,
  } = useProjectWizard();

  const [stepErrors, setStepErrors] = useState({});
  const [savingDraft, setSavingDraft] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState('');
  const [submissionError, setSubmissionError] = useState('');

  const stepComponents = useMemo(
    () => [
      <BasicInfoStep data={state.basicInfo} updateSection={(payload) => updateSection('basicInfo', payload)} errors={stepErrors} />, 
      <DeliveryDetailsStep data={state.deliveryDetails} updateSection={(payload) => updateSection('deliveryDetails', payload)} errors={stepErrors} />,
      <TeamCompositionStep
        data={state.teamComposition}
        updateSection={(payload) => updateSection('teamComposition', payload)}
        setTeamRows={setTeamRows}
        errors={stepErrors}
      />,
      <TechnologyStep data={state.technology} updateSection={(payload) => updateSection('technology', payload)} errors={stepErrors} />,
      <FinancialStep data={state.financial} updateSection={(payload) => updateSection('financial', payload)} errors={stepErrors} />,
      <RiskStep data={state.risks} updateSection={(payload) => updateSection('risks', payload)} errors={stepErrors} />,
      <ReviewSubmitStep
        state={state}
        onEdit={(step) => setCurrentStep(step)}
      />,
    ],
    [state, stepErrors, updateSection, setTeamRows, setCurrentStep]
  );

  const draftPayload = useMemo(
    () => ({
      basicInfo: state.basicInfo,
      deliveryDetails: state.deliveryDetails,
      teamComposition: state.teamComposition,
      technology: state.technology,
      financial: state.financial,
      risks: state.risks,
    }),
    [state]
  );

  const validateStep = () => {
    const errors = {};
    switch (state.currentStep) {
      case 0:
        if (!state.basicInfo.project_name.trim()) errors.project_name = 'Project name is required';
        if (!state.basicInfo.client_name.trim()) errors.client_name = 'Client name is required';
        if (!state.basicInfo.industry.trim()) errors.industry = 'Industry is required';
        if (!state.basicInfo.project_type.trim()) errors.project_type = 'Project type is required';
        if (!state.basicInfo.delivery_model.trim()) errors.delivery_model = 'Delivery model is required';
        break;
      case 1:
        if (!state.deliveryDetails.start_date) errors.start_date = 'Start date is required';
        if (!state.deliveryDetails.planned_end_date) errors.planned_end_date = 'Planned end date is required';
        if (!state.deliveryDetails.sprint_length) errors.sprint_length = 'Sprint length is required';
        if (!state.deliveryDetails.release_frequency) errors.release_frequency = 'Release frequency is required';
        break;
      case 2:
        if (!state.teamComposition.rows.length) {
          errors.teamComposition = 'At least one team role is required';
        } else {
          state.teamComposition.rows.forEach((row, index) => {
            if (!row.role.trim()) errors[`role_${index}`] = 'Role is required';
            if (!row.count || Number(row.count) <= 0) errors[`count_${index}`] = 'Count must be greater than zero';
          });
        }
        break;
      case 3:
        if (!state.technology.technology_stack.trim()) errors.technology_stack = 'Technology stack is required';
        if (!state.technology.architecture_type.trim()) errors.architecture_type = 'Architecture type is required';
        if (!state.technology.cloud_platform.trim()) errors.cloud_platform = 'Cloud platform is required';
        if (!state.technology.integration_count) errors.integration_count = 'Integration count is required';
        if (!state.technology.complexity) errors.complexity = 'Complexity is required';
        break;
      case 4:
        if (!state.financial.budget) errors.budget = 'Budget is required';
        if (!state.financial.planned_effort) errors.planned_effort = 'Planned effort is required';
        if (!state.financial.estimated_team_size) errors.estimated_team_size = 'Estimated team size is required';
        break;
      case 5:
        if (!state.risks.dependency_count) errors.dependency_count = 'Dependency count is required';
        if (!state.risks.compliance_requirements.trim()) errors.compliance_requirements = 'Compliance requirements are required';
        if (!state.risks.criticality.trim()) errors.criticality = 'Criticality is required';
        if (!state.risks.requirement_stability_index) errors.requirement_stability_index = 'Stability index is required';
        break;
      default:
        break;
    }
    return errors;
  };

  const saveDraftData = async () => {
    setSavingDraft(true);
    try {
      if (state.draftId) {
        await updateDraft(state.draftId, draftPayload);
      } else {
        const result = await createDraft(draftPayload);
        setDraftId(result.draftId);
      }
      setDraftSaved(true);
      setSubmissionMessage('Draft saved successfully.');
      setSubmissionError('');
    } catch (error) {
      setSubmissionError(error.message || 'Unable to save draft');
      setSubmissionMessage('');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleNext = async () => {
    const errors = validateStep();
    if (Object.keys(errors).length > 0) {
      setStepErrors(errors);
      return;
    }

    setStepErrors({});
    if (state.currentStep < steps.length - 1) {
      setCurrentStep(state.currentStep + 1);
      await saveDraftData();
    }
  };

  const handlePrevious = () => {
    if (state.currentStep > 0) {
      setStepErrors({});
      setCurrentStep(state.currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    const errors = validateStep();
    if (Object.keys(errors).length > 0) {
      setStepErrors(errors);
      return;
    }

    setSubmissionError('');
    setSubmissionMessage('');
    setSavingDraft(true);
    try {
      const payload = {
        draftId: state.draftId,
        projectData: draftPayload,
      };
      await submitProject(payload);
      setSubmissionMessage('Project submitted successfully.');
      setSubmissionError('');
    } catch (error) {
      setSubmissionError(error.message || 'Unable to submit project');
    } finally {
      setSavingDraft(false);
    }
  };

  const currentStep = state.currentStep;

  if (loading) {
    return (
      <div className="project-wizard-loading">
        <CSpinner /> Loading draft...
      </div>
    );
  }

  return (
    <CCard className="project-wizard-card">
      <CCardBody>
        <WizardTabs
          steps={steps}
          currentStep={currentStep}
          onSelect={(index) => setCurrentStep(index)}
        />

        {submissionMessage && <CAlert color="success">{submissionMessage}</CAlert>}
        {submissionError && <CAlert color="danger">{submissionError}</CAlert>}

        <div className="project-wizard-step-container">
          {stepComponents[currentStep]}
        </div>
      </CCardBody>
      <CCardFooter className="project-wizard-footer">
        <div className="wizard-actions">
          <CButton
            color="secondary"
            disabled={currentStep === 0}
            onClick={handlePrevious}
          >
            Previous
          </CButton>
          <div className="wizard-action-group">
            <CButton color="outline" onClick={saveDraftData} disabled={savingDraft}>
              {savingDraft ? 'Saving...' : 'Save Draft'}
            </CButton>
            {currentStep < steps.length - 1 ? (
              <CButton color="primary" onClick={handleNext}>
                Next
              </CButton>
            ) : (
              <CButton color="success" onClick={handleSubmit} disabled={savingDraft}>
                {savingDraft ? 'Submitting...' : 'Submit Project'}
              </CButton>
            )}
          </div>
        </div>
      </CCardFooter>
    </CCard>
  );
};

export default ProjectWizard;
