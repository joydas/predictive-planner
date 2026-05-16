import React from 'react';
import { CRow, CCol, CForm, CFormInput, CFormSelect } from '@coreui/react';

const architectureOptions = ['Monolithic', 'Microservices', 'Event-driven', 'Serverless'];
const cloudOptions = ['AWS', 'Azure', 'GCP', 'Private Cloud', 'Hybrid'];
const technologyStackOptions = ['Java', 'Python', 'React', 'Angular', 'Node.js', '.NET', 'SAP', 'Salesforce', 'Data/BI', 'Full Stack'];
const externalDependencyOptions = ['None', 'Internal systems only', 'Third-party APIs', 'Vendor product dependency', 'Regulatory/external approval', 'Multiple external parties'];

const TechnologyStep = ({ data, updateSection, errors }) => {
  const handleChange = (field) => (event) => {
    updateSection({ [field]: event.target.value });
  };

  return (
    <div className="wizard-step-panel">
      <h3>Technology & Architecture</h3>
      <CForm>
        <CRow className="mb-4">
          <CCol md={6}>
            <label className="form-label">Technology Stack</label>
            <CFormSelect
              value={data.technology_stack}
              onChange={handleChange('technology_stack')}
              invalid={!!errors.technology_stack}
            >
              <option value="">Select stack</option>
              {technologyStackOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            {errors.technology_stack && <div className="form-error">{errors.technology_stack}</div>}
          </CCol>
          <CCol md={6}>
            <label className="form-label">Architecture Type</label>
            <CFormSelect
              value={data.architecture_type}
              onChange={handleChange('architecture_type')}
              invalid={!!errors.architecture_type}
            >
              <option value="">Select architecture</option>
              {architectureOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            {errors.architecture_type && <div className="form-error">{errors.architecture_type}</div>}
          </CCol>
        </CRow>
        <CRow className="mb-4">
          <CCol md={4}>
            <label className="form-label">Cloud Platform</label>
            <CFormSelect
              value={data.cloud_platform}
              onChange={handleChange('cloud_platform')}
              invalid={!!errors.cloud_platform}
            >
              <option value="">Select platform</option>
              {cloudOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            {errors.cloud_platform && <div className="form-error">{errors.cloud_platform}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Integration Count</label>
            <CFormInput
              type="number"
              value={data.integration_count}
              onChange={handleChange('integration_count')}
              invalid={!!errors.integration_count}
              min="0"
            />
            {errors.integration_count && <div className="form-error">{errors.integration_count}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Complexity</label>
            <CFormSelect
              value={data.complexity}
              onChange={handleChange('complexity')}
              invalid={!!errors.complexity}
            >
              <option value="">Select complexity</option>
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </CFormSelect>
            {errors.complexity && <div className="form-error">{errors.complexity}</div>}
          </CCol>
        </CRow>
        <CRow>
          <CCol md={6}>
            <label className="form-label">External Dependencies</label>
            <CFormSelect
              value={data.external_dependencies}
              onChange={handleChange('external_dependencies')}
              invalid={!!errors.external_dependencies}
            >
              <option value="">Select dependency profile</option>
              {externalDependencyOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            <div className="form-help-text">Select the dependency type; integration count captures the number.</div>
            {errors.external_dependencies && <div className="form-error">{errors.external_dependencies}</div>}
          </CCol>
        </CRow>
      </CForm>
    </div>
  );
};

export default TechnologyStep;
