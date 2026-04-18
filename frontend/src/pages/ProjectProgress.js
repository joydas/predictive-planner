import React, { useState } from 'react';
import { CCard, CCardBody, CCardHeader, CCol, CRow, CForm, CFormInput, CFormTextarea, CButton, CAlert, CFormFeedback, CSpinner } from '@coreui/react';
import { useParams, useNavigate } from 'react-router-dom';
import authService from '../services/authService';
import { NODE_API_URL } from '../config';

const ProjectProgress = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
    effortSpent: '',
    tasksCompleted: ''
  });

  const [showSuccess, setShowSuccess] = useState(false);
  const [predictedDelay, setPredictedDelay] = useState(null);
  const [apiMessage, setApiMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [predicting, setPredicting] = useState(false);

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

    if (!formData.date) {
      errors.date = 'Date is required';
    }

    if (!formData.effortSpent || Number(formData.effortSpent) <= 0) {
      errors.effortSpent = 'Effort spent must be a positive number';
    } else if (Number(formData.effortSpent) > 1000) {
      errors.effortSpent = 'Effort spent cannot exceed 1000 hours';
    }

    if (!formData.tasksCompleted.trim()) {
      errors.tasksCompleted = 'Tasks completed is required';
    } else if (formData.tasksCompleted.trim().length < 5) {
      errors.tasksCompleted = 'Tasks completed must be at least 5 characters';
    }

    return errors;
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      effortSpent: '',
      tasksCompleted: ''
    });
    setFormErrors({});
    setApiMessage('');
    setPredictedDelay(null);
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

      const response = await fetch(`${NODE_API_URL}/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          project_id: Number(projectId),
          date: formData.date,
          effort_spent: Number(formData.effortSpent),
          tasks_completed: formData.tasksCompleted.trim(),
          created_by: currentUser.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to submit progress');
      }

      setApiMessage(data.message || 'Progress submitted successfully');
      setShowSuccess(true);
    } catch (error) {
      setSubmitError(error.message || 'Submission failed. Please try again.');
      setShowSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const handlePredictDelay = async () => {
    setPredicting(true);
    setSubmitError('');

    try {
      const response = await fetch(`${NODE_API_URL}/project-delay/${projectId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to predict delay');
      }

      setPredictedDelay(data.predicted_final_effort ?? null);
      setApiMessage('Delay prediction updated');
      setShowSuccess(true);
    } catch (error) {
      setSubmitError(error.message || 'Prediction failed. Please try again.');
      setShowSuccess(false);
    } finally {
      setPredicting(false);
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
              Progress Tracking
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
                {predictedDelay !== null && (
                  <div className="mt-2">
                    Predicted Final Effort: <strong>{predictedDelay}h</strong>
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
          <CCard className="mb-4">
            <CCardHeader>
              <strong>Submit Progress</strong>
            </CCardHeader>
            <CCardBody>
              <CForm onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label htmlFor="date" className="form-label">
                    Date <span style={{ color: '#f5576c' }}>*</span>
                  </label>
                  <CFormInput
                    type="date"
                    id="date"
                    name="date"
                    value={formData.date}
                    onChange={handleInputChange}
                    invalid={!!formErrors.date}
                    disabled={loading}
                  />
                  {formErrors.date && (
                    <CFormFeedback invalid className="d-block">
                      {formErrors.date}
                    </CFormFeedback>
                  )}
                </div>

                <div className="mb-4">
                  <label htmlFor="effortSpent" className="form-label">
                    Effort Spent (hours) <span style={{ color: '#f5576c' }}>*</span>
                  </label>
                  <CFormInput
                    type="number"
                    id="effortSpent"
                    name="effortSpent"
                    value={formData.effortSpent}
                    onChange={handleInputChange}
                    placeholder="Enter hours spent on this progress update"
                    invalid={!!formErrors.effortSpent}
                    disabled={loading}
                    step="0.5"
                    min="0"
                  />
                  {formErrors.effortSpent && (
                    <CFormFeedback invalid className="d-block">
                      {formErrors.effortSpent}
                    </CFormFeedback>
                  )}
                  <small className="text-muted">
                    Enter the number of hours spent on project work
                  </small>
                </div>

                <div className="mb-4">
                  <label htmlFor="tasksCompleted" className="form-label">
                    Tasks Completed <span style={{ color: '#f5576c' }}>*</span>
                  </label>
                  <CFormTextarea
                    id="tasksCompleted"
                    name="tasksCompleted"
                    value={formData.tasksCompleted}
                    onChange={handleInputChange}
                    rows={4}
                    placeholder="Describe the tasks that were completed..."
                    invalid={!!formErrors.tasksCompleted}
                    disabled={loading}
                  />
                  {formErrors.tasksCompleted && (
                    <CFormFeedback invalid className="d-block">
                      {formErrors.tasksCompleted}
                    </CFormFeedback>
                  )}
                  <small className="text-muted">
                    Provide details about what was accomplished
                  </small>
                </div>

                <div className="d-flex gap-3">
                  <CButton type="submit" color="primary" size="md" className="smaller-button" disabled={loading}>
                    {loading ? (
                      <>
                        <CSpinner component="span" size="sm" className="me-2" aria-hidden="true" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <span style={{ marginRight: '0.5rem' }}>📊</span>
                        Submit Progress
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

          <CCard>
            <CCardHeader>
              <strong>Predict Project Delay</strong>
            </CCardHeader>
            <CCardBody>
              <div className="text-center mb-3">
                <p className="text-muted">
                  Get an updated prediction of the final effort required for this project based on current progress.
                </p>
              </div>
              <div className="d-flex justify-content-center">
                <CButton
                  color="warning"
                  size="md"
                  className="smaller-button"
                  onClick={handlePredictDelay}
                  disabled={predicting}
                >
                  {predicting ? (
                    <>
                      <CSpinner component="span" size="sm" className="me-2" aria-hidden="true" />
                      Predicting...
                    </>
                  ) : (
                    <>
                      <span style={{ marginRight: '0.5rem' }}>🔮</span>
                      Predict Delay
                    </>
                  )}
                </CButton>
              </div>
            </CCardBody>
          </CCard>
        </CCol>

        <CCol lg={4}>
          <CCard className="mb-4">
            <CCardHeader>
              <strong>Progress Tracking Info</strong>
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
                  📈
                </div>
                <h5>Track Project Progress</h5>
                <p className="text-muted small">
                  Regularly update project progress to maintain accurate predictions and timelines.
                </p>
                <div className="mt-3 p-3 bg-light rounded">
                  <strong>What happens when you submit:</strong>
                  <ul className="text-start mt-2 mb-0 small">
                    <li>✅ Progress is recorded</li>
                    <li>🤖 AI analyzes progress patterns</li>
                    <li>📊 Predictions are updated</li>
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
                  <strong>Date:</strong> Use the actual date when work was performed
                </div>
                <div className="p-2 border rounded">
                  <strong>Effort:</strong> Record actual hours spent, not estimates
                </div>
                <div className="p-2 border rounded">
                  <strong>Tasks:</strong> Be specific about what was accomplished
                </div>
                <div className="p-2 border rounded">
                  <strong>Frequency:</strong> Update progress at least weekly
                </div>
              </div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
};

export default ProjectProgress;