import React from 'react';
import { CNav, CNavItem, CNavLink } from '@coreui/react';

const WizardTabs = ({ steps, currentStep, onSelect }) => {
  return (
    <CNav variant="tabs" className="project-wizard-tabs">
      {steps.map((step, index) => (
        <CNavItem key={step.key}>
          <CNavLink
            active={index === currentStep}
            className={`project-wizard-tab ${index === currentStep ? 'active' : ''}`}
            onClick={() => onSelect(index)}
          >
            <span className="step-index">{index + 1}.</span>
            {step.label}
          </CNavLink>
        </CNavItem>
      ))}
    </CNav>
  );
};

export default WizardTabs;
