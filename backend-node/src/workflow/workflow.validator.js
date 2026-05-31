const WORKFLOW_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  RETURNED: 'RETURNED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

const ACTION_TYPE = {
  SUBMIT: 'SUBMIT',
  RESUBMIT: 'RESUBMIT',
  APPROVE: 'APPROVE',
  RETURN: 'RETURN',
  REJECT: 'REJECT',
};

const ROLE = {
  PM: 'PM',
  ACCOUNT_MANAGER: 'ACCOUNT_MANAGER',
};

function normalizeRole(role) {
  const value = String(role || '').trim().toUpperCase();
  return value === 'AM' ? ROLE.ACCOUNT_MANAGER : value;
}

function normalizeStatus(status) {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'OPEN') return WORKFLOW_STATUS.DRAFT;
  return value || WORKFLOW_STATUS.DRAFT;
}

function requireComment(comment) {
  if (!comment || !String(comment).trim()) {
    const error = new Error('Comment is required for workflow transitions');
    error.status = 400;
    throw error;
  }
}

function validateTransition({ fromStatus, actionType, role, comment }) {
  const currentStatus = normalizeStatus(fromStatus);
  const actorRole = normalizeRole(role);
  const action = String(actionType || '').trim().toUpperCase();

  requireComment(comment);

  if ([ACTION_TYPE.SUBMIT, ACTION_TYPE.RESUBMIT].includes(action)) {
    if (actorRole !== ROLE.PM) {
      const error = new Error('Only PM can submit or resubmit');
      error.status = 403;
      throw error;
    }

    if (![WORKFLOW_STATUS.DRAFT, WORKFLOW_STATUS.RETURNED, WORKFLOW_STATUS.REJECTED].includes(currentStatus)) {
      const error = new Error(`Cannot submit from ${currentStatus}`);
      error.status = 400;
      throw error;
    }

    return {
      actionType: currentStatus === WORKFLOW_STATUS.RETURNED ? ACTION_TYPE.RESUBMIT : ACTION_TYPE.SUBMIT,
      toStatus: WORKFLOW_STATUS.SUBMITTED,
    };
  }

  if ([ACTION_TYPE.APPROVE, ACTION_TYPE.RETURN, ACTION_TYPE.REJECT].includes(action)) {
    if (actorRole !== ROLE.ACCOUNT_MANAGER) {
      const error = new Error('Only ACCOUNT_MANAGER can approve, return, or reject');
      error.status = 403;
      throw error;
    }

    if (currentStatus !== WORKFLOW_STATUS.SUBMITTED) {
      const error = new Error(`Cannot ${action.toLowerCase()} from ${currentStatus}`);
      error.status = 400;
      throw error;
    }

    const toStatusByAction = {
      [ACTION_TYPE.APPROVE]: WORKFLOW_STATUS.APPROVED,
      [ACTION_TYPE.RETURN]: WORKFLOW_STATUS.RETURNED,
      [ACTION_TYPE.REJECT]: WORKFLOW_STATUS.REJECTED,
    };

    return {
      actionType: action,
      toStatus: toStatusByAction[action],
    };
  }

  const error = new Error('Unsupported workflow action');
  error.status = 400;
  throw error;
}

module.exports = {
  ACTION_TYPE,
  ROLE,
  WORKFLOW_STATUS,
  normalizeRole,
  normalizeStatus,
  validateTransition,
};
