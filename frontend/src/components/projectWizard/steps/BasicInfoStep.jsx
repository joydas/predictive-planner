import React from 'react';
import { CRow, CCol, CForm, CFormInput, CFormSelect } from '@coreui/react';

const projectTypes = ['New Build', 'Modernization', 'Migration', 'Support'];
const deliveryModels = ['Agile', 'Waterfall', 'Hybrid'];
const criticalityOptions = ['Low', 'Medium', 'High', 'Critical'];

const BasicInfoStep = ({ data, industries = [], updateSection, errors }) => {
  const handleChange = (field) => (event) => {
    updateSection({ [field]: event.target.value });
  };
  const selectedIndustry = industries.find((industry) =>
    industry.industryCode === data.industry_code
    || industry.industryName === data.industry
  );
  const hasHistoricalIndustry = data.industry && !selectedIndustry && !data.industry_code;
  const selectedIndustryCode = data.industry_code
    || selectedIndustry?.industryCode
    || (hasHistoricalIndustry ? `__historical__:${data.industry}` : '');
  const handleIndustryChange = (event) => {
    const industryCode = event.target.value;
    const industry = industries.find((item) => item.industryCode === industryCode);
    updateSection({
      industry_code: industryCode,
      industry: industry?.industryName || '',
    });
  };

  return (
    <div className="wizard-step-panel">
      <h3>Basic Information</h3>
      <CForm>
        <CRow className="mb-4">
          <CCol md={6}>
            <label className="form-label">Project Name</label>
            <CFormInput
              value={data.project_name}
              onChange={handleChange('project_name')}
              invalid={!!errors.project_name}
            />
            {errors.project_name && <div className="form-error">{errors.project_name}</div>}
          </CCol>
          <CCol md={6}>
            <label className="form-label">Client Name</label>
            <CFormInput
              value={data.client_name}
              onChange={handleChange('client_name')}
              invalid={!!errors.client_name}
            />
            {errors.client_name && <div className="form-error">{errors.client_name}</div>}
          </CCol>
        </CRow>
        <CRow className="mb-4">
          <CCol md={4}>
            <label className="form-label">Industry</label>
            <CFormSelect
              value={selectedIndustryCode}
              onChange={handleIndustryChange}
              invalid={!!errors.industry}
            >
              <option value="">Select industry</option>
              {hasHistoricalIndustry && (
                <option value={selectedIndustryCode} disabled>{data.industry} (historical)</option>
              )}
              {industries.map((industry) => (
                <option key={industry.industryCode} value={industry.industryCode}>
                  {industry.industryName}
                </option>
              ))}
            </CFormSelect>
            {errors.industry && <div className="form-error">{errors.industry}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Project Type</label>
            <CFormSelect value={data.project_type} onChange={handleChange('project_type')} invalid={!!errors.project_type}>
              <option value="">Select type</option>
              {projectTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </CFormSelect>
            {errors.project_type && <div className="form-error">{errors.project_type}</div>}
          </CCol>
          <CCol md={4}>
            <label className="form-label">Delivery Model</label>
            <CFormSelect value={data.delivery_model} onChange={handleChange('delivery_model')} invalid={!!errors.delivery_model}>
              <option value="">Select model</option>
              {deliveryModels.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </CFormSelect>
            {errors.delivery_model && <div className="form-error">{errors.delivery_model}</div>}
          </CCol>
        </CRow>
        <CRow>
          <CCol md={4}>
            <label className="form-label">Business Criticality</label>
            <CFormSelect
              value={data.business_criticality}
              onChange={handleChange('business_criticality')}
              invalid={!!errors.business_criticality}
            >
              <option value="">Select criticality</option>
              {criticalityOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            {errors.business_criticality && <div className="form-error">{errors.business_criticality}</div>}
          </CCol>
        </CRow>
      </CForm>
    </div>
  );
};

export default BasicInfoStep;
