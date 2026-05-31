import React from 'react';
import BasicInfoStep from './BasicInfoStep';
import DeliveryDetailsStep from './DeliveryDetailsStep';
import TechnologyStep from './TechnologyStep';
import RiskStep from './RiskStep';
import FinancialStep from './FinancialStep';

const ProjectInformationStep = ({
  state,
  updateSection,
  errors,
}) => (
  <div className="wizard-step-panel project-information-panel">
    <BasicInfoStep
      data={state.basicInfo}
      industries={state.masterData.industries}
      updateSection={(payload) => updateSection('basicInfo', payload)}
      errors={errors}
    />
    <DeliveryDetailsStep
      data={state.deliveryDetails}
      deliveryModel={state.basicInfo.delivery_model}
      updateSection={(payload) => updateSection('deliveryDetails', payload)}
      errors={errors}
    />
    <TechnologyStep
      data={state.technology}
      updateSection={(payload) => updateSection('technology', payload)}
      errors={errors}
    />
    <RiskStep
      data={state.risks}
      updateSection={(payload) => updateSection('risks', payload)}
      errors={errors}
    />
    <FinancialStep
      data={state.financial}
      updateSection={(payload) => updateSection('financial', payload)}
      errors={errors}
    />
  </div>
);

export default ProjectInformationStep;
