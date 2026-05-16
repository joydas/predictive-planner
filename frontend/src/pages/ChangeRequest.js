import React, { useCallback, useEffect, useState } from 'react';
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CForm,
  CFormFeedback,
  CFormInput,
  CFormSelect,
  CFormTextarea,
  CRow,
  CSpinner,
} from '@coreui/react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import WorkflowPanel from '../components/WorkflowPanel';
import authService from '../services/authService';
import {
  createChangeRequest,
  getChangeRequest,
  getProjectChangeRequests,
  transitionChangeRequest,
} from '../services/crService';

const statusColors = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  RETURNED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

const valueOrDash = (value) => (value === null || value === undefined || value === '' ? '-' : value);

const ChangeRequest = () => {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    description: '',
    impactHours: '',
    category: '',
    severity: '',
    comment: '',
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [newPrediction, setNewPrediction] = useState(null);
  const [apiMessage, setApiMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [changeRequests, setChangeRequests] = useState([]);
  const [selectedCr, setSelectedCr] = useState(null);
  const [workflowHistory, setWorkflowHistory] = useState([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  const loadChangeRequests = useCallback(async () => {
    try {
      const data = await getProjectChangeRequests(projectId);
      setChangeRequests(data.changeRequests || []);
    } catch (error) {
      setSubmitError(error.message || 'Failed to load change requests');
    }
  }, [projectId]);

  useEffect(() => {
    loadChangeRequests();
  }, [loadChangeRequests]);

  useEffect(() => {
    const crId = searchParams.get('crId');
    if (crId) {
      loadCrDetails(crId);
    }
  }, [searchParams]);

  const loadCrDetails = async (crId) => {
    try {
      const data = await getChangeRequest(crId);
      setSelectedCr(data.changeRequest);
      setWorkflowHistory(data.workflowHistory || []);
      setSubmitError('');
    } catch (error) {
      setSubmitError(error.message || 'Failed to load change request');
    }
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
    if (formErrors[name]) {
      setFormErrors((current) => ({
        ...current,
        [name]: '',
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

    if (!formData.comment.trim()) {
      errors.comment = 'PM submit comment is required';
    }

    return errors;
  };

  const resetForm = () => {
    setFormData({
      description: '',
      impactHours: '',
      category: '',
      severity: '',
      comment: '',
    });
    setFormErrors({});
    setApiMessage('');
    setNewPrediction(null);
    setSubmitError('');
    setShowSuccess(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const data = await createChangeRequest({
        project_id: Number(projectId),
        description: formData.description.trim(),
        impact_hours: Number(formData.impactHours),
        category: formData.category,
        severity: formData.severity,
        comment: formData.comment.trim(),
      });

      setNewPrediction(data.new_prediction ?? null);
      setApiMessage(data.message || 'Change request created successfully');
      setShowSuccess(true);
      await loadChangeRequests();
      if (data.crId) {
        await loadCrDetails(data.crId);
      }
    } catch (error) {
      setSubmitError(error.message || 'Submission failed. Please try again.');
      setShowSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  const handleWorkflowAction = async (action, comment) => {
    if (!selectedCr) return;
    setWorkflowLoading(true);
    try {
      const result = await transitionChangeRequest(selectedCr.crId, action, comment);
      setWorkflowHistory(result.workflowHistory || []);
      setSelectedCr((current) => ({
        ...current,
        workflowStatus: result.transition.toStatus,
        status: result.transition.toStatus,
        latestComment: result.transition.latestComment,
      }));
      await loadChangeRequests();
      setSubmitError('');
    } catch (error) {
      setSubmitError(error.message || 'Workflow transition failed');
    } finally {
      setWorkflowLoading(false);
    }
  };

  const role = authService.getUserRole();
  const normalizedRole = String(role || '').toUpperCase();
  const selectedStatus = String(selectedCr?.workflowStatus || selectedCr?.status || '').toUpperCase();
  const isAccountManager = normalizedRole === 'ACCOUNT_MANAGER';
  const showCreateForm = !selectedCr && !isAccountManager;

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <div className="d-flex align-items-center mb-3">
            <CButton
              color="secondary"
              variant="outline"
              onClick={() => navigate(selectedCr ? '/crs' : '/projects')}
              className="me-3 smaller-button"
            >
              {selectedCr ? 'Back to CRs' : 'Back to Projects'}
            </CButton>
            <h1 className="page-title mb-0">{selectedCr ? `Change Request #${selectedCr.crId}` : 'Change Request'}</h1>
          </div>
          <p className="text-muted">Project ID: {projectId}</p>
        </CCol>
      </CRow>

      {(showSuccess || submitError) && (
        <CRow className="mb-4">
          <CCol xs={12}>
            {showSuccess && (
              <CAlert color="success">
                <strong>{apiMessage}</strong>
                {newPrediction !== null && (
                  <div className="mt-2">
                    Updated Predicted Hours: <strong>{newPrediction}h</strong>
                  </div>
                )}
              </CAlert>
            )}
            {submitError && (
              <CAlert color="danger">
                <strong>Error:</strong> {submitError}
              </CAlert>
            )}
          </CCol>
        </CRow>
      )}

      <CRow>
        <CCol lg={8}>
          {selectedCr && (
            <CCard className="mb-4">
              <CCardHeader className="d-flex justify-content-between align-items-center">
                <strong>Change Request Details</strong>
                <CBadge color={statusColors[selectedStatus] || 'secondary'}>{selectedStatus || 'DRAFT'}</CBadge>
              </CCardHeader>
              <CCardBody>
                <CRow className="g-3">
                  <CCol md={6}>
                    <div className="text-muted small">CR Category</div>
                    <div className="fw-semibold">{valueOrDash(selectedCr.category)}</div>
                  </CCol>
                  <CCol md={6}>
                    <div className="text-muted small">Severity</div>
                    <div className="fw-semibold">{valueOrDash(selectedCr.severity)}</div>
                  </CCol>
                  <CCol md={6}>
                    <div className="text-muted small">Impact Hours</div>
                    <div className="fw-semibold">{valueOrDash(selectedCr.impactHours)}</div>
                  </CCol>
                  <CCol md={6}>
                    <div className="text-muted small">Latest Reviewer Comment</div>
                    <div className="fw-semibold">{valueOrDash(selectedCr.latestComment)}</div>
                  </CCol>
                  <CCol xs={12}>
                    <div className="text-muted small">Description</div>
                    <div className="fw-semibold">{valueOrDash(selectedCr.description)}</div>
                  </CCol>
                </CRow>

                {normalizedRole === 'PM' && ['RETURNED', 'REJECTED', 'DRAFT'].includes(selectedStatus) && (
                  <CAlert color="warning" className="mt-4 mb-0">
                    Use the workflow panel to add your response comment and resubmit this change request.
                  </CAlert>
                )}
              </CCardBody>
            </CCard>
          )}

          {showCreateForm && (
            <CCard className="mb-4">
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
                      placeholder="Estimated impact on project timeline"
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
                      Positive values increase estimated time, negative values decrease it.
                    </small>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="category" className="form-label">
                      CR Category
                    </label>
                    <CFormSelect
                      id="category"
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      disabled={loading}
                    >
                      <option value="">Select category</option>
                      <option value="Scope">Scope</option>
                      <option value="Schedule">Schedule</option>
                      <option value="Cost">Cost</option>
                      <option value="Quality">Quality</option>
                      <option value="Risk">Risk</option>
                    </CFormSelect>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="severity" className="form-label">
                      Severity
                    </label>
                    <CFormSelect
                      id="severity"
                      name="severity"
                      value={formData.severity}
                      onChange={handleInputChange}
                      disabled={loading}
                    >
                      <option value="">Select severity</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </CFormSelect>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="comment" className="form-label">
                      PM submit comment <span style={{ color: '#f5576c' }}>*</span>
                    </label>
                    <CFormTextarea
                      id="comment"
                      name="comment"
                      value={formData.comment}
                      onChange={handleInputChange}
                      rows={3}
                      placeholder="Add context for Account Manager review"
                      invalid={!!formErrors.comment}
                      disabled={loading}
                    />
                    {formErrors.comment && (
                      <CFormFeedback invalid className="d-block">
                        {formErrors.comment}
                      </CFormFeedback>
                    )}
                  </div>

                  <div className="d-flex gap-3">
                    <CButton type="submit" color="primary" size="md" className="smaller-button" disabled={loading}>
                      {loading ? (
                        <>
                          <CSpinner component="span" size="sm" className="me-2" aria-hidden="true" />
                          Creating...
                        </>
                      ) : (
                        'Create and Submit'
                      )}
                    </CButton>
                    <CButton type="button" color="secondary" variant="outline" size="md" className="smaller-button" onClick={resetForm} disabled={loading}>
                      Reset Form
                    </CButton>
                  </div>
                </CForm>
              </CCardBody>
            </CCard>
          )}
        </CCol>

        <CCol lg={4}>
          {selectedCr && (
            <WorkflowPanel
              status={selectedCr.workflowStatus}
              history={workflowHistory}
              onAction={handleWorkflowAction}
              loading={workflowLoading}
              title={`CR #${selectedCr.crId} Workflow`}
            />
          )}

          <CCard className="mb-4">
            <CCardHeader>
              <strong>Project Change Requests</strong>
            </CCardHeader>
            <CCardBody>
              {changeRequests.length === 0 ? (
                <p className="text-muted mb-0">No change requests yet.</p>
              ) : (
                <div className="d-grid gap-2">
                  {changeRequests.map((cr) => (
                    <CButton
                      key={cr.crId}
                      color={selectedCr?.crId === cr.crId ? 'primary' : 'secondary'}
                      variant={selectedCr?.crId === cr.crId ? undefined : 'outline'}
                      size="sm"
                      className="text-start"
                      onClick={() => loadCrDetails(cr.crId)}
                    >
                      #{cr.crId} {cr.workflowStatus} - {cr.description.slice(0, 40)}
                    </CButton>
                  ))}
                </div>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
};

export default ChangeRequest;
