import React from 'react';
import { CCol, CFormInput, CRow } from '@coreui/react';

const FinancialImpactStep = ({ data, updateSection }) => (
  <div className="wizard-step-panel">
    <h3>Financial Impact</h3>
    <CRow className="g-3">
      <CCol md={4}>
        <label className="form-label">Additional Budget</label>
        <CFormInput type="number" min="0" value={data.additionalBudget} onChange={(event) => updateSection({ additionalBudget: event.target.value })} />
      </CCol>
      <CCol md={4}>
        <label className="form-label">Additional Licensing Cost</label>
        <CFormInput type="number" min="0" value={data.additionalLicensingCost} onChange={(event) => updateSection({ additionalLicensingCost: event.target.value })} />
      </CCol>
      <CCol md={4}>
        <label className="form-label">Infrastructure Cost Impact</label>
        <CFormInput type="number" min="0" value={data.infrastructureCostImpact} onChange={(event) => updateSection({ infrastructureCostImpact: event.target.value })} />
      </CCol>
    </CRow>
  </div>
);

export default FinancialImpactStep;
