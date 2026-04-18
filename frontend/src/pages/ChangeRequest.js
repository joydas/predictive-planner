import React, { useState } from 'react';
import { CCard, CCardBody, CCardHeader, CCol, CRow, CForm, CFormInput, CFormTextarea, CButton, CAlert, CFormFeedback, CSpinner } from '@coreui/react';
import { useParams, useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import { NODE_API_URL } from '../config';

const ChangeRequest = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    description: '',
    impactHours: ''
  });

  const [showSuccess, setShowSuccess] = useState(false);
  const [newPrediction, setNewPrediction] = useState(null);
  const [apiMessage, setApiMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear field-specific error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    } else if (formData.description.trim().length < 10) {
      errors.description = 'Description must be at least 10 characters';
    }

    if (!formData.impactHours || Number(formData.impactHours) === 0) {
      errors.impactHours = 'Impact hours is required';
    } else if (Number(formData.impactHours) < -1000 || Number(formData.impactHours) > 1000) {
      errors.impactHours = 'Impact hours must be between -1000 and 1000';
    }

    return errors;
  };

  const resetForm = () => {
    setFormData({
      description: '',
      impactHours: ''
    });
    setFormErrors({});
    setApiMessage('');
    setNewPrediction(null);
    setSubmitError('');
    setShowSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setLoading(true);

    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        setSubmitError('Authentication required. Please login again.');
        setLoading(false);
        return;
      }

      const response = await fetch(`${NODE_API_URL}/change-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          project_id: Number(projectId),
          description: formData.description.trim(),
          impact_hours: Number(formData.impactHours),
          created_by: currentUser.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create change request');
      }

      setNewPrediction(data.new_prediction ?? null);
      setApiMessage(data.message || 'Change request created successfully');
      setShowSuccess(true);
    } catch (error) {
      setSubmitError(error.message || 'Submission failed. Please try again.');
      setShowSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <div className="d-flex align-items-center mb-3">
            <CButton
              color="secondary"
              variant="outline"
              onClick={() => navigate('/projects')}
              className="me-3 smaller-button"
            >
              ← Back to Projects
            </CButton>
            <h1 className="page-title" style={{
              background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontWeight: '700',
              margin: 0
            }}>
              Change Request
            </h1>
          </div>
          <p className="text-muted">Project ID: {projectId}</p>
        </CCol>
      </CRow>

      {(showSuccess || submitError) && (
        <CRow className="mb-4">
          <CCol xs={12}>
            {showSuccess && (
              <CAlert color="success" dismissible>
                <strong>{apiMessage}</strong>
                {newPrediction !== null && (
                  <div className="mt-2">
                    Updated Predicted Hours: <strong>{newPrediction}h</strong>
                  </div>
                )}
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
              <strong>Create Change Request</strong>
            </CCardHeader>
            <CCardBody>
              <CForm onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label htmlFor="description" className="form-label">
                    Description <span style={{ color: '#f5576c' }}>*</span>
                  </label>
                  <CFormTextarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    placeholder="Describe the change request in detail..."
                    invalid={!!formErrors.description}
                    disabled={loading}
                  />
                  {formErrors.description && (
                    <CFormFeedback invalid className="d-block">
                      {formErrors.description}
                    </CFormFeedback>
                  )}
                </div>

                <div className="mb-4">
                  <label htmlFor="impactHours" className="form-label">
                    Impact Hours <span style={{ color: '#f5576c' }}>*</span>
                  </label>
                  <CFormInput
                    type="number"
                    id="impactHours"
                    name="impactHours"
                    value={formData.impactHours}
                    onChange={handleInputChange}
                    placeholder="Estimated impact on project timeline (can be negative)"
                    invalid={!!formErrors.impactHours}
                    disabled={loading}
                    step="1"
                  />
                  {formErrors.impactHours && (
                    <CFormFeedback invalid className="d-block">
                      {formErrors.impactHours}
                    </CFormFeedback>
                  )}
                  <small className="text-muted">
                    Positive values increase estimated time, negative values decrease it
                  </small>
                </div>

                <div className="d-flex gap-3">
                  <CButton type="submit" color="primary" size="md" className="smaller-button" disabled={loading}>
                    {loading ? (
                      <>
                        <CSpinner component="span" size="sm" className="me-2" aria-hidden="true" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <span style={{ marginRight: '0.5rem' }}>📝</span>
                        Create Change Request
                      </>
                    )}
                  </CButton>
                  <CButton type="button" color="secondary" variant="outline" size="md" className="smaller-button" onClick={resetForm} disabled={loading}>
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
              <strong>Change Request Info</strong>
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
                  📝
                </div>
                <h5>Change Request Process</h5>
                <p className="text-muted small">
                  Submit change requests to update project predictions based on new requirements or scope changes.
                </p>
                <div className="mt-3 p-3 bg-light rounded">
                  <strong>What happens next:</strong>
                  <ul className="text-start mt-2 mb-0 small">
                    <li>✅ Change request is recorded</li>
                    <li>🤖 AI recalculates predictions</li>
                    <li>📊 Updated timeline shown</li>
                    <li>📧 Stakeholders notified</li>
                  </ul>
                </div>
              </div>
            </CCardBody>
          </CCard>

          <CCard>
            <CCardHeader>
              <strong>Guidelines</strong>
            </CCardHeader>
            <CCardBody>
              <div className="d-grid gap-2">
                <div className="p-2 border rounded">
                  <strong>Description:</strong> Be specific about what changes are needed
                </div>
                <div className="p-2 border rounded">
                  <strong>Impact Hours:</strong> Estimate the time impact (positive or negative)
                </div>
                <div className="p-2 border rounded">
                  <strong>Review:</strong> Changes will be reviewed by project managers
                </div>
              </div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
};

export default ChangeRequest;