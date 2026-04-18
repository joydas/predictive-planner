import React, { useState } from 'react';
import { CCard, CCardBody, CCardHeader, CCol, CRow, CForm, CFormInput, CFormSelect, CButton, CAlert, CFormFeedback } from '@coreui/react';
import authService from '../services/authService';
import { NODE_API_URL } from '../config';

const CreateProject = () => {
  const [formData, setFormData] = useState({
    name: '',
    businessUnit: '',
    technology: '',
    complexity: '',
    teamSize: '',
    estimatedHours: '',
    avgExperience: '',
    technologyScore: ''
  });

  const [showSuccess, setShowSuccess] = useState(false);
  const [predictedHours, setPredictedHours] = useState(null);
  const [apiMessage, setApiMessage] = useState('');
  const [explanation, setExplanation] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [formErrors, setFormErrors] = useState({});

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.name.trim()) errors.name = 'Project name is required';
    if (!formData.businessUnit) errors.businessUnit = 'Business unit is required';
    if (!formData.technology) errors.technology = 'Technology is required';
    if (!formData.complexity || Number(formData.complexity) < 1 || Number(formData.complexity) > 10) errors.complexity = 'Complexity must be between 1 and 10';
    if (!formData.teamSize || Number(formData.teamSize) <= 0) errors.teamSize = 'Team size must be greater than zero';
    if (!formData.estimatedHours || Number(formData.estimatedHours) <= 0) errors.estimatedHours = 'Estimated hours must be greater than zero';
    if (!formData.avgExperience || Number(formData.avgExperience) < 0) errors.avgExperience = 'Average experience is required';
    if (!formData.technologyScore || Number(formData.technologyScore) < 0) errors.technologyScore = 'Technology score is required';

    return errors;
  };

  const resetForm = () => {
    setFormData({
      name: '',
      businessUnit: '',
      technology: '',
      complexity: '',
      teamSize: '',
      estimatedHours: '',
      avgExperience: '',
      technologyScore: ''
    });
    setFormErrors({});
    setApiMessage('');
    setPredictedHours(null);
    setExplanation('');
    setSubmitError('');
    setShowSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateForm();
    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      setShowSuccess(false);
      return;
    }

    setSubmitError('');

    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        setSubmitError('Authentication required. Please login again.');
        return;
      }

      const response = await fetch(`${NODE_API_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: formData.name,
          business_unit: formData.businessUnit,
          technology: formData.technology,
          complexity: Number(formData.complexity),
          team_size: Number(formData.teamSize),
          estimated_hours: Number(formData.estimatedHours),
          avg_experience: Number(formData.avgExperience),
          technology_score: Number(formData.technologyScore),
          created_by: currentUser.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create project');
      }

      setPredictedHours(data.predicted_hours ?? null);
      setExplanation(data.explanation || '');
      setApiMessage(data.message || 'Project created successfully');
      setShowSuccess(true);
    } catch (error) {
      setSubmitError(error.message || 'Submission failed. Please try again.');
      setShowSuccess(false);
    }
  };

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <h1 className="page-title" style={{
            background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontWeight: '700'
          }}>
            Create New Project
          </h1>
          <p className="text-muted">Fill in the details below to create a new project with AI-powered predictions</p>
        </CCol>
      </CRow>

      {(showSuccess || submitError) && (
        <CRow className="mb-4">
          <CCol xs={12}>
            {showSuccess && (
              <CAlert color="success" dismissible>
                <strong>
                  {predictedHours !== null && explanation
                    ? `Project created with predicted hours: ${predictedHours}h and explanation: ${explanation}`
                    : apiMessage
                  }
                </strong>
              </CAlert>
            )}
            {submitError && (
              <CAlert color="danger" dismissible>
                <strong>Error:</strong> {submitError}
              </CAlert>
            )}
          </CCol>
        </CRow>
      )}

      <CRow>
        <CCol lg={8}>
          <CCard>
            <CCardHeader>
              <strong>Project Details</strong>
            </CCardHeader>
            <CCardBody>
              <CForm onSubmit={handleSubmit}>
                <CRow className="mb-3">
                  <CCol md={6}>
                    <label htmlFor="name" className="form-label">
                      Project Name <span style={{ color: '#f5576c' }}>*</span>
                    </label>
                    <CFormInput
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Enter project name"
                      invalid={!!formErrors.name}
                      required
                    />
                    {formErrors.name && <CFormFeedback invalid>{formErrors.name}</CFormFeedback>}
                  </CCol>
                  <CCol md={6}>
                    <label htmlFor="businessUnit" className="form-label">
                      Business Unit <span style={{ color: '#f5576c' }}>*</span>
                    </label>
                    <CFormSelect
                      id="businessUnit"
                      name="businessUnit"
                      value={formData.businessUnit}
                      onChange={handleInputChange}
                      invalid={!!formErrors.businessUnit}
                      required
                    >
                      <option value="">Select business unit</option>
                      <option value="retail">Retail</option>
                      <option value="finance">Finance</option>
                      <option value="healthcare">Healthcare</option>
                      <option value="technology">Technology</option>
                      <option value="education">Education</option>
                    </CFormSelect>
                  </CCol>
                </CRow>

                <CRow className="mb-3">
                  <CCol md={6}>
                    <label htmlFor="technology" className="form-label">
                      Technology Stack <span style={{ color: '#f5576c' }}>*</span>
                    </label>
                    <CFormSelect
                      id="technology"
                      name="technology"
                      value={formData.technology}
                      onChange={handleInputChange}
                      invalid={!!formErrors.technology}
                      required
                    >
                      <option value="">Select technology</option>
                      <option value="react">React</option>
                      <option value="vue">Vue.js</option>
                      <option value="angular">Angular</option>
                      <option value="node">Node.js</option>
                      <option value="python">Python</option>
                      <option value="java">Java</option>
                      <option value="dotnet">.NET</option>
                    </CFormSelect>
                    {formErrors.technology && <CFormFeedback invalid>{formErrors.technology}</CFormFeedback>}
                  </CCol>
                  <CCol md={6}>
                    <label htmlFor="complexity" className="form-label">
                      Complexity Level (1-10) <span style={{ color: '#f5576c' }}>*</span>
                    </label>
                    <div className="d-flex align-items-center gap-3">
                      <input
                        type="range"
                        id="complexity"
                        name="complexity"
                        min="1"
                        max="10"
                        value={formData.complexity || 5}
                        onChange={handleInputChange}
                        className="form-range flex-grow-1"
                        style={{ height: '6px' }}
                      />
                      <span className="badge bg-primary" style={{ minWidth: '40px', textAlign: 'center' }}>
                        {formData.complexity || '5'}
                      </span>
                    </div>
                    {formErrors.complexity && <small className="text-danger d-block mt-2">{formErrors.complexity}</small>}
                  </CCol>
                </CRow>

                <CRow className="mb-3">
                  <CCol md={6}>
                    <label htmlFor="teamSize" className="form-label">
                      Team Size <span style={{ color: '#f5576c' }}>*</span>
                    </label>
                    <CFormInput
                      type="number"
                      id="teamSize"
                      name="teamSize"
                      value={formData.teamSize}
                      onChange={handleInputChange}
                      placeholder="Number of team members"
                      min="1"
                      invalid={!!formErrors.teamSize}
                      required
                    />
                    {formErrors.teamSize && <CFormFeedback invalid>{formErrors.teamSize}</CFormFeedback>}
                  </CCol>
                  <CCol md={6}>
                    <label htmlFor="estimatedHours" className="form-label">
                      Estimated Hours <span style={{ color: '#f5576c' }}>*</span>
                    </label>
                    <CFormInput
                      type="number"
                      id="estimatedHours"
                      name="estimatedHours"
                      value={formData.estimatedHours}
                      onChange={handleInputChange}
                      placeholder="Estimated hours"
                      min="1"
                      step="10"
                      invalid={!!formErrors.estimatedHours}
                      required
                    />
                    {formErrors.estimatedHours && <CFormFeedback invalid>{formErrors.estimatedHours}</CFormFeedback>}
                  </CCol>
                </CRow>

                <CRow className="mb-3">
                  <CCol md={6}>
                    <label htmlFor="avgExperience" className="form-label">
                      Avg Experience (years) <span style={{ color: '#f5576c' }}>*</span>
                    </label>
                    <CFormInput
                      type="number"
                      id="avgExperience"
                      name="avgExperience"
                      value={formData.avgExperience}
                      onChange={handleInputChange}
                      placeholder="Avg experience"
                      min="0"
                      step="1"
                      invalid={!!formErrors.avgExperience}
                      required
                    />
                    {formErrors.avgExperience && <CFormFeedback invalid>{formErrors.avgExperience}</CFormFeedback>}
                  </CCol>
                  <CCol md={6}>
                    <label htmlFor="technologyScore" className="form-label">
                      Technology Score <span style={{ color: '#f5576c' }}>*</span>
                    </label>
                    <CFormInput
                      type="number"
                      id="technologyScore"
                      name="technologyScore"
                      value={formData.technologyScore}
                      onChange={handleInputChange}
                      placeholder="Technology score"
                      min="0"
                      step="0.1"
                      invalid={!!formErrors.technologyScore}
                      required
                    />
                    {formErrors.technologyScore && <CFormFeedback invalid>{formErrors.technologyScore}</CFormFeedback>}
                  </CCol>
                </CRow>

                <div className="d-flex gap-3">
                  <CButton type="submit" color="primary" size="md" className="smaller-button">
                    <span style={{ marginRight: '0.5rem' }}>🚀</span>
                    Create Project with AI Prediction
                  </CButton>
                  <CButton type="button" color="secondary" variant="outline" size="md" className="smaller-button" onClick={resetForm}>
                    <span style={{ marginRight: '0.5rem' }}>🔄</span>
                    Reset Form
                  </CButton>
                </div>
              </CForm>
            </CCardBody>
          </CCard>
        </CCol>

        <CCol lg={4}>
          <CCard className="mb-4">
            <CCardHeader>
              <strong>AI Prediction Preview</strong>
            </CCardHeader>
            <CCardBody>
              <div className="text-center">
                <div style={{
                  fontSize: '2.5rem',
                  marginBottom: '1rem',
                  background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                  🤖
                </div>
                <h5>Smart Predictions</h5>
                <p className="text-muted small">
                  Our AI will analyze your project parameters and provide accurate time and resource predictions.
                </p>
                <div className="mt-3 p-3 bg-light rounded">
                  <strong>Expected Benefits:</strong>
                  <ul className="text-start mt-2 mb-0 small">
                    <li>🎯 Accurate timeline predictions</li>
                    <li>👥 Optimal team recommendations</li>
                    <li>📊 Risk assessment</li>
                    <li>💰 Cost optimization</li>
                  </ul>
                </div>
              </div>
            </CCardBody>
          </CCard>

          <CCard>
            <CCardHeader>
              <strong>Quick Tips</strong>
            </CCardHeader>
            <CCardBody>
              <div className="d-grid gap-2">
                <div className="p-2 border rounded">
                  <strong>Team Size:</strong> Consider project complexity and technology stack
                </div>
                <div className="p-2 border rounded">
                  <strong>Hours:</strong> Include buffer time for unexpected challenges
                </div>
                <div className="p-2 border rounded">
                  <strong>Description:</strong> Be specific about deliverables and constraints
                </div>
              </div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
};

export default CreateProject;