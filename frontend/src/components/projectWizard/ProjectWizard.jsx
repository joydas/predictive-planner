import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { deriveResourcePlanning } from '../../utils/resourcePlanning';
import { getPlanningMasterData } from '../../services/masterDataService';

const steps = [
  { key: 'basicInfo', label: 'Basic Information' },
  { key: 'deliveryDetails', label: 'Delivery & Timeline' },
  { key: 'technology', label: 'Technology & Architecture' },
  { key: 'risks', label: 'Risks & Dependencies' },
  { key: 'financial', label: 'Financial Assumptions' },
  { key: 'teamComposition', label: 'Resource Loading & Planning' },
  { key: 'review', label: 'Review & Submit' },
];

const ProjectWizard = ({ loading, mode = 'create' }) => {
  const {
    state,
    setCurrentStep,
    updateSection,
    setTeamRows,
    setMasterData,
    setDraftId,
    setDraftSaved,
  } = useProjectWizard();

  const [stepErrors, setStepErrors] = useState({});
  const [savingDraft, setSavingDraft] = useState(false);
  const [masterDataError, setMasterDataError] = useState('');
  const [submissionMessage, setSubmissionMessage] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [submitComment, setSubmitComment] = useState('');
  const setMasterDataRef = useRef(setMasterData);
  const previousProjectDatesRef = useRef({
    startDate: state.deliveryDetails.start_date,
    endDate: state.deliveryDetails.planned_end_date,
  });

  useEffect(() => {
    let active = true;
    getPlanningMasterData()
      .then((data) => {
        if (active) {
          setMasterDataRef.current(data);
          setMasterDataError('');
        }
      })
      .catch((error) => {
        if (active) {
          setMasterDataError(error.message || 'Unable to load planning master data');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const previousDates = previousProjectDatesRef.current;
    const nextStartDate = state.deliveryDetails.start_date;
    const nextEndDate = state.deliveryDetails.planned_end_date;

    if (!state.teamComposition.rows.length) {
      previousProjectDatesRef.current = { startDate: nextStartDate, endDate: nextEndDate };
      return;
    }

    const rows = state.teamComposition.rows.map((row) => {
      const startWasInherited = !row.startDate || row.startDate === previousDates.startDate;
      const endWasInherited = !row.endDate || row.endDate === previousDates.endDate;
      return {
        ...row,
        startDate: startWasInherited ? nextStartDate : row.startDate,
        endDate: endWasInherited ? nextEndDate : row.endDate,
      };
    });

    const changed = rows.some((row, index) =>
      row.startDate !== state.teamComposition.rows[index].startDate
      || row.endDate !== state.teamComposition.rows[index].endDate
    );
    if (changed) {
      setTeamRows(rows);
    }
    previousProjectDatesRef.current = { startDate: nextStartDate, endDate: nextEndDate };
  }, [state.deliveryDetails.start_date, state.deliveryDetails.planned_end_date, state.teamComposition.rows, setTeamRows]);

  const draftPayload = useMemo(
    () => {
      const rowsWithDefaultDates = state.teamComposition.rows.map((row) => ({
        ...row,
        locationType: row.locationType || 'ONSITE',
        startDate: row.startDate || state.deliveryDetails.start_date,
        endDate: row.endDate || state.deliveryDetails.planned_end_date,
      }));
      const derived = deriveResourcePlanning({
        rows: rowsWithDefaultDates,
        financial: state.financial,
        rateCards: state.masterData.rateCards,
      });
      return {
      draftId: state.draftId,
      basicInfo: state.basicInfo,
      deliveryDetails: state.deliveryDetails,
      teamComposition: {
        ...state.teamComposition,
        rows: derived.rows,
      },
      technology: state.technology,
      financial: {
        ...state.financial,
        planned_effort: Number(derived.planned_effort.toFixed(2)),
        estimated_team_size: Number(derived.estimated_team_size.toFixed(2)),
        base_resource_cost: Number(derived.baseResourceCost.toFixed(2)),
        budget: Number(derived.budget.toFixed(2)),
      },
      risks: state.risks,
      mlRecommendation: state.mlRecommendation,
    };
    },
    [state]
  );

  const stepComponents = useMemo(
    () => [
      <BasicInfoStep data={state.basicInfo} updateSection={(payload) => updateSection('basicInfo', payload)} errors={stepErrors} />, 
      <DeliveryDetailsStep
        data={state.deliveryDetails}
        deliveryModel={state.basicInfo.delivery_model}
        updateSection={(payload) => updateSection('deliveryDetails', payload)}
        errors={stepErrors}
      />,
      <TechnologyStep data={state.technology} updateSection={(payload) => updateSection('technology', payload)} errors={stepErrors} />,
      <RiskStep data={state.risks} updateSection={(payload) => updateSection('risks', payload)} errors={stepErrors} />,
      <FinancialStep data={state.financial} updateSection={(payload) => updateSection('financial', payload)} errors={stepErrors} />,
      <TeamCompositionStep
        data={state.teamComposition}
        deliveryDetails={state.deliveryDetails}
        financial={state.financial}
        masterData={state.masterData}
        mlRecommendation={state.mlRecommendation}
        projectData={draftPayload}
        updateMlRecommendation={(payload) => updateSection('mlRecommendation', payload)}
        setTeamRows={setTeamRows}
        errors={stepErrors}
      />,
      <ReviewSubmitStep
        state={{
          ...state,
          teamComposition: draftPayload.teamComposition,
          financial: draftPayload.financial,
        }}
        onEdit={(step) => setCurrentStep(step)}
        submitComment={submitComment}
        onSubmitCommentChange={setSubmitComment}
        commentError={stepErrors.submitComment}
      />,
    ],
    [state, draftPayload, stepErrors, updateSection, setTeamRows, setCurrentStep, submitComment]
  );

  const validateStep = (step = state.currentStep) => {
    const errors = {};
    switch (step) {
      case 0:
        if (!state.basicInfo.project_name.trim()) errors.project_name = 'Project name is required';
        if (!state.basicInfo.client_name.trim()) errors.client_name = 'Client name is required';
        if (!state.basicInfo.industry.trim()) errors.industry = 'Industry is required';
        if (!state.basicInfo.project_type.trim()) errors.project_type = 'Project type is required';
        if (!state.basicInfo.delivery_model.trim()) errors.delivery_model = 'Delivery model is required';
        if (!state.basicInfo.business_criticality.trim()) errors.business_criticality = 'Business criticality is required';
        break;
      case 1:
        if (!state.deliveryDetails.start_date) errors.start_date = 'Start date is required';
        if (!state.deliveryDetails.planned_end_date) errors.planned_end_date = 'Planned end date is required';
        if (state.deliveryDetails.start_date && state.deliveryDetails.planned_end_date && state.deliveryDetails.planned_end_date < state.deliveryDetails.start_date) {
          errors.planned_end_date = 'End date cannot be before start date';
        }
        if (!state.deliveryDetails.sprint_length) errors.sprint_length = 'Sprint length is required';
        if (!state.deliveryDetails.release_frequency) errors.release_frequency = 'Release frequency is required';
        if (String(state.basicInfo.delivery_model || '').toLowerCase() !== 'agile' && state.deliveryDetails.milestone_count === '') {
          errors.milestone_count = 'Milestone count is required for non-Agile delivery';
        }
        break;
      case 2:
        if (!state.technology.technology_stack.trim()) errors.technology_stack = 'Technology stack is required';
        if (!state.technology.architecture_type.trim()) errors.architecture_type = 'Architecture type is required';
        if (!state.technology.cloud_platform.trim()) errors.cloud_platform = 'Cloud platform is required';
        if (state.technology.integration_count === '') errors.integration_count = 'Integration count is required';
        if (!state.technology.external_dependencies.trim()) errors.external_dependencies = 'External dependencies are required';
        if (!state.technology.complexity) errors.complexity = 'Complexity is required';
        break;
      case 3:
        if (state.risks.dependency_count === '') errors.dependency_count = 'Dependency count is required';
        if (!state.risks.compliance_requirements.trim()) errors.compliance_requirements = 'Compliance requirements are required';
        if (!state.risks.criticality.trim()) errors.criticality = 'Criticality is required';
        if (!state.risks.requirement_stability_index) errors.requirement_stability_index = 'Stability index is required';
        if (!state.risks.expected_cr_volatility.trim()) errors.expected_cr_volatility = 'CR volatility is required';
        if (!state.risks.risk_level_indicators.trim()) errors.risk_level_indicators = 'Risk level indicators are required';
        break;
      case 4:
        if (state.financial.management_reserve_percent === '') errors.management_reserve_percent = 'Management reserve is required';
        if (state.financial.contingency_reserve_percent === '') errors.contingency_reserve_percent = 'Contingency reserve is required';
        if (!state.financial.billing_model.trim()) errors.billing_model = 'Billing model is required';
        break;
      case 5:
        break;
      case 6:
        Object.assign(errors, validateResourceLoading());
        break;
      default:
        break;
    }
    return errors;
  };

  const validateResourceLoading = () => {
    const errors = {};
    if (!state.teamComposition.rows.length) {
      errors.teamComposition = 'At least one resource loading row is required before submission';
    } else {
      state.teamComposition.rows.forEach((row, index) => {
        if (!row.roleId) errors[`role_${index}`] = `Row ${index + 1}: role is required`;
        if (!row.locationType) errors[`locationType_${index}`] = `Row ${index + 1}: location type is required`;
        if (!row.count || Number(row.count) <= 0) errors[`count_${index}`] = `Row ${index + 1}: count must be greater than zero`;
        if (row.allocationPercent === '' || Number(row.allocationPercent) <= 0) errors[`allocation_${index}`] = `Row ${index + 1}: allocation must be greater than zero`;
        const rowStartDate = row.startDate || state.deliveryDetails.start_date;
        const rowEndDate = row.endDate || state.deliveryDetails.planned_end_date;
        if (!rowStartDate) errors[`startDate_${index}`] = `Row ${index + 1}: start date is required`;
        if (!rowEndDate) errors[`endDate_${index}`] = `Row ${index + 1}: end date is required`;
        if (rowStartDate && state.deliveryDetails.start_date && rowStartDate < state.deliveryDetails.start_date) {
          errors[`startDate_${index}`] = `Row ${index + 1}: start date cannot be before project start date`;
        }
        if (rowEndDate && state.deliveryDetails.planned_end_date && rowEndDate > state.deliveryDetails.planned_end_date) {
          errors[`endDate_${index}`] = `Row ${index + 1}: end date cannot be after project end date`;
        }
        if (rowStartDate && rowEndDate && rowEndDate < rowStartDate) {
          errors[`endDate_${index}`] = `Row ${index + 1}: end date cannot be before start date`;
        }
      });
    }
    return errors;
  };

  const validateSubmit = () => {
    const errors = {};
    for (let step = 0; step < steps.length; step += 1) {
      Object.assign(errors, validateStep(step));
    }
    Object.assign(errors, validateResourceLoading());
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
      setSubmissionMessage(mode === 'edit' ? 'Changes saved successfully.' : 'Draft saved successfully.');
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
    const errors = validateSubmit();
    if (!submitComment.trim()) {
      errors.submitComment = 'PM submit comment is required';
    }
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
        comment: submitComment.trim(),
      };
      await submitProject(payload);
      setSubmissionMessage(mode === 'edit' ? 'Project resubmitted successfully.' : 'Project submitted successfully.');
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
        {masterDataError && <CAlert color="warning">{masterDataError}</CAlert>}

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
              {savingDraft ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Save Draft'}
            </CButton>
            {currentStep < steps.length - 1 ? (
              <CButton color="primary" onClick={handleNext}>
                Next
              </CButton>
            ) : (
              <CButton color="success" onClick={handleSubmit} disabled={savingDraft}>
                {savingDraft ? 'Submitting...' : mode === 'edit' ? 'Resubmit Project' : 'Submit Project'}
              </CButton>
            )}
          </div>
        </div>
      </CCardFooter>
    </CCard>
  );
};

export default ProjectWizard;
