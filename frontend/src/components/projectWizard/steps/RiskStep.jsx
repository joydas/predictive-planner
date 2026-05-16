import React from 'react';
import { CRow, CCol, CForm, CFormInput, CFormSelect } from '@coreui/react';

const criticalityOptions = ['Low', 'Medium', 'High', 'Critical'];
const volatilityOptions = ['Low', 'Medium', 'High'];
const complianceOptions = ['None', 'Internal policy only', 'SOX', 'HIPAA', 'PCI-DSS', 'GDPR', 'Multi-regulatory'];
const riskIndicatorOptions = ['Low overall risk', 'Medium delivery risk', 'High dependency risk', 'High requirement risk', 'High technical risk', 'Critical multi-factor risk'];

const RiskStep = ({ data, updateSection, errors }) => {
  const handleChange = (field) => (event) => {
    updateSection({ [field]: event.target.value });
  };

  return (
    <div className="wizard-step-panel">
      <h3>Risks & Dependencies</h3>
      <CForm>
        <CRow className="mb-4">
          <CCol md={4}>
            <label className="form-label">Dependency Count</label>
            <CFormInput
              type="number"
              value={data.dependency_count}
              onChange={handleChange('dependency_count')}
              invalid={!!errors.dependency_count}
              min="0"
            />
            {errors.dependency_count && <div className="form-error">{errors.dependency_count}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Compliance Requirements</label>
            <CFormSelect
              value={data.compliance_requirements}
              onChange={handleChange('compliance_requirements')}
              invalid={!!errors.compliance_requirements}
            >
              <option value="">Select compliance profile</option>
              {complianceOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            <div className="form-help-text">Select the applicable compliance category; use None when not applicable.</div>
            {errors.compliance_requirements && <div className="form-error">{errors.compliance_requirements}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Criticality</label>
            <CFormSelect
              value={data.criticality}
              onChange={handleChange('criticality')}
              invalid={!!errors.criticality}
            >
              <option value="">Select criticality</option>
              {criticalityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            {errors.criticality && <div className="form-error">{errors.criticality}</div>}
          </CCol>
        </CRow>
        <CRow>
          <CCol md={4}>
            <label className="form-label">Requirement Stability Index</label>
            <CFormInput
              type="number"
              value={data.requirement_stability_index}
              onChange={handleChange('requirement_stability_index')}
              invalid={!!errors.requirement_stability_index}
              min="0"
              max="100"
            />
            {errors.requirement_stability_index && <div className="form-error">{errors.requirement_stability_index}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Expected CR Volatility</label>
            <CFormSelect
              value={data.expected_cr_volatility}
              onChange={handleChange('expected_cr_volatility')}
              invalid={!!errors.expected_cr_volatility}
            >
              <option value="">Select volatility</option>
              {volatilityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            {errors.expected_cr_volatility && <div className="form-error">{errors.expected_cr_volatility}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Risk Level Indicators</label>
            <CFormSelect
              value={data.risk_level_indicators}
              onChange={handleChange('risk_level_indicators')}
              invalid={!!errors.risk_level_indicators}
            >
              <option value="">Select risk indicator</option>
              {riskIndicatorOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            <div className="form-help-text">Select the dominant risk signal, not a free-form note.</div>
            {errors.risk_level_indicators && <div className="form-error">{errors.risk_level_indicators}</div>}
          </CCol>
        </CRow>
      </CForm>
    </div>
  );
};

export default RiskStep;
