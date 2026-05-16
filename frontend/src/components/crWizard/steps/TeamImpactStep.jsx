import React from 'react';
import { CCol, CFormInput, CRow } from '@coreui/react';

const fields = [
  ['additionalPmCount', 'Additional PM Count'],
  ['additionalDevCount', 'Additional Dev Count'],
  ['additionalQaCount', 'Additional QA Count'],
  ['additionalDevOpsCount', 'Additional DevOps Count'],
  ['additionalArchitectCount', 'Additional Architect Count'],
];

const TeamImpactStep = ({ data, updateSection }) => (
  <div className="wizard-step-panel">
    <h3>Team Impact</h3>
    <CRow className="g-3">
      {fields.map(([key, label]) => (
        <CCol md={4} key={key}>
          <label className="form-label">{label}</label>
          <CFormInput
            type="number"
            min="0"
            step="0.25"
            value={data[key]}
            onChange={(event) => updateSection({ [key]: event.target.value })}
          />
        </CCol>
      ))}
    </CRow>
  </div>
);

export default TeamImpactStep;
