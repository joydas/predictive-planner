const crService = require('../services/cr.service');

async function createDraft(req, res) {
  try {
    const result = await crService.createDraft(req.user, req.body);
    return res.status(201).json({ message: 'Change request draft created', crId: result.crId });
  } catch (error) {
    console.error('Change request draft creation failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to create change request draft' });
  }
}

async function updateDraft(req, res) {
  try {
    const crId = Number(req.params.id);
    if (!crId) {
      return res.status(400).json({ message: 'Change request id is required' });
    }

    await crService.updateDraft(req.user, crId, req.body);
    return res.json({ message: 'Change request draft updated', crId });
  } catch (error) {
    console.error('Change request draft update failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to update change request draft' });
  }
}

async function submitDraft(req, res) {
  try {
    const crId = Number(req.params.id);
    if (!crId) {
      return res.status(400).json({ message: 'Change request id is required' });
    }

    const result = await crService.submitChangeRequest(req.user, crId, req.body.crData || req.body, req.body.comment);
    const workflowHistory = await crService.getWorkflowHistory(crId);
    return res.json({ message: 'Change request submitted', crId: result.crId, transition: result.transition, workflowHistory });
  } catch (error) {
    console.error('Change request submission failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to submit change request' });
  }
}

async function createAndSubmit(req, res) {
  try {
    const result = await crService.submitChangeRequest(req.user, null, req.body.crData || req.body, req.body.comment);
    const workflowHistory = await crService.getWorkflowHistory(result.crId);
    return res.status(201).json({ message: 'Change request submitted', crId: result.crId, transition: result.transition, workflowHistory });
  } catch (error) {
    console.error('Change request creation failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to create change request' });
  }
}

async function getChangeRequest(req, res) {
  try {
    const crId = Number(req.params.id);
    if (!crId) {
      return res.status(400).json({ message: 'Change request id is required' });
    }

    const changeRequest = await crService.getChangeRequest(req.user, crId);
    if (!changeRequest) {
      return res.status(404).json({ message: 'Change request not found' });
    }

    const workflowHistory = await crService.getWorkflowHistory(crId);
    return res.json({ changeRequest, workflowHistory });
  } catch (error) {
    console.error('Change request retrieval failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load change request' });
  }
}

async function listByProject(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: 'Project id is required' });
    }

    const changeRequests = await crService.getChangeRequestsByProject(req.user, projectId);
    return res.json({ changeRequests });
  } catch (error) {
    console.error('Change request list failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load change requests' });
  }
}

async function getProjectStaffingBaseline(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    const excludeCrId = Number(req.query.excludeCrId || 0) || null;
    if (!projectId) {
      return res.status(400).json({ message: 'Project id is required' });
    }

    const staffing = await crService.getProjectStaffingBaseline(req.user, projectId, excludeCrId);
    return res.json(staffing);
  } catch (error) {
    console.error('CR staffing baseline retrieval failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load staffing baseline' });
  }
}

async function listMyCrs(req, res) {
  try {
    const result = await crService.listCrsForPm(req.user, req.query || {});
    return res.json(result);
  } catch (error) {
    console.error('Change request list failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load change requests' });
  }
}

async function getWorkflowHistory(req, res) {
  try {
    const crId = Number(req.params.id);
    if (!crId) {
      return res.status(400).json({ message: 'Change request id is required' });
    }

    const workflowHistory = await crService.getWorkflowHistory(crId);
    return res.json({ workflowHistory });
  } catch (error) {
    console.error('Change request workflow history retrieval failed:', error);
    return res.status(error.status || 500).json({ message: error.message || 'Failed to load workflow history' });
  }
}

function crTransition(actionType) {
  return async (req, res) => {
    try {
      const crId = Number(req.params.id);
      if (!crId) {
        return res.status(400).json({ message: 'Change request id is required' });
      }

      const transition = await crService.transitionChangeRequest(crId, req.user, actionType, req.body.comment);
      const workflowHistory = await crService.getWorkflowHistory(crId);
      return res.json({ message: `Change request ${transition.toStatus.toLowerCase()}`, transition, workflowHistory });
    } catch (error) {
      console.error(`Change request ${actionType} failed:`, error);
      return res.status(error.status || 500).json({ message: error.message || 'Change request workflow transition failed' });
    }
  };
}

module.exports = {
  approveChangeRequest: crTransition('APPROVE'),
  createAndSubmit,
  createChangeRequest: createAndSubmit,
  createDraft,
  getChangeRequest,
  getProjectStaffingBaseline,
  getWorkflowHistory,
  listByProject,
  listMyCrs,
  rejectChangeRequest: crTransition('REJECT'),
  returnChangeRequest: crTransition('RETURN'),
  submitDraft,
  updateDraft,
};
