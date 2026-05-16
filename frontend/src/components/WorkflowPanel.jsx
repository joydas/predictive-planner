import React, { useState } from 'react';
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CFormTextarea,
  CSpinner,
} from '@coreui/react';
import authService from '../services/authService';
import { formatDisplayDateTime } from '../utils/dateUtils';

const statusColors = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  RETURNED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

const actionLabels = {
  submit: 'Submit',
  approve: 'Approve',
  return: 'Return',
  reject: 'Reject',
};

function getAvailableActions(status, role, allowRejectedSubmit) {
  const normalizedStatus = String(status || 'DRAFT').toUpperCase();
  const normalizedRole = String(role || '').toUpperCase();

  const pmSubmitStatuses = allowRejectedSubmit ? ['DRAFT', 'RETURNED', 'REJECTED'] : ['DRAFT', 'RETURNED'];
  if (normalizedRole === 'PM' && pmSubmitStatuses.includes(normalizedStatus)) {
    return ['submit'];
  }

  if (normalizedRole === 'ACCOUNT_MANAGER' && normalizedStatus === 'SUBMITTED') {
    return ['approve', 'return', 'reject'];
  }

  return [];
}

const formatDateTime = (value) => {
  return formatDisplayDateTime(value);
};

const WorkflowPanel = ({
  status,
  history = [],
  onAction,
  loading = false,
  title = 'Workflow',
  allowRejectedSubmit = true,
}) => {
  const role = authService.getUserRole();
  const actions = getAvailableActions(status, role, allowRejectedSubmit);
  const actionsKey = actions.join('|');
  const [comment, setComment] = useState('');
  const [selectedAction, setSelectedAction] = useState(actions[0] || '');
  const [error, setError] = useState('');

  React.useEffect(() => {
    const nextActions = actionsKey ? actionsKey.split('|') : [];
    setSelectedAction(nextActions[0] || '');
  }, [actionsKey]);

  const handleAction = async () => {
    if (!selectedAction) return;
    if (!comment.trim()) {
      setError('Comment is required.');
      return;
    }

    setError('');
    await onAction(selectedAction, comment.trim());
    setComment('');
  };

  return (
    <CCard className="mb-4">
      <CCardHeader className="d-flex justify-content-between align-items-center">
        <strong>{title}</strong>
        <CBadge color={statusColors[status] || 'secondary'}>{status || 'DRAFT'}</CBadge>
      </CCardHeader>
      <CCardBody>
        {error && <CAlert color="danger">{error}</CAlert>}

        {actions.length > 0 && (
          <div className="mb-4">
            <CFormTextarea
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add workflow comment"
              disabled={loading}
            />
            <div className="d-flex flex-wrap gap-2 mt-3">
              {actions.map((action) => (
                <CButton
                  key={action}
                  color={action === 'approve' ? 'success' : action === 'reject' ? 'danger' : action === 'return' ? 'warning' : 'primary'}
                  variant={selectedAction === action ? undefined : 'outline'}
                  size="sm"
                  onClick={() => setSelectedAction(action)}
                  disabled={loading}
                >
                  {actionLabels[action]}
                </CButton>
              ))}
              <CButton color="primary" size="sm" onClick={handleAction} disabled={loading || !selectedAction}>
                {loading ? <CSpinner component="span" size="sm" /> : `Confirm ${actionLabels[selectedAction]}`}
              </CButton>
            </div>
          </div>
        )}

        <div className="workflow-history">
          {history.length === 0 ? (
            <p className="text-muted mb-0">No workflow history yet.</p>
          ) : (
            history.map((item, index) => (
              <div key={item.workflowHistoryId} className={`border-start ps-3 pb-3 mb-3${index === 0 ? ' bg-light rounded p-2' : ''}`}>
                <div className="d-flex justify-content-between gap-3 flex-wrap">
                  <div>
                    <strong>{item.actorName || `User ${item.actionByUserId}`}</strong>
                    <span className="text-muted ms-2">{item.actionByRole}</span>
                  </div>
                  <small className="text-muted">{formatDateTime(item.createdAt)}</small>
                </div>
                <div className="mb-1">
                  <CBadge color="secondary" className="me-2">{item.actionType}</CBadge>
                  <span className="text-muted">{item.fromStatus} to {item.toStatus}</span>
                </div>
                <div>{item.actionComment}</div>
              </div>
            ))
          )}
        </div>
      </CCardBody>
    </CCard>
  );
};

export default WorkflowPanel;
