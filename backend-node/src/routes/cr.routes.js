const express = require('express');
const crController = require('../controllers/cr.controller');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', authenticateToken, crController.listMyCrs);
router.post('/', authenticateToken, authorizeRoles(['PM']), crController.createAndSubmit);
router.post('/draft', authenticateToken, authorizeRoles(['PM']), crController.createDraft);
router.get('/project/:projectId', authenticateToken, crController.listByProject);
router.get('/:id', authenticateToken, crController.getChangeRequest);
router.put('/:id/draft', authenticateToken, authorizeRoles(['PM']), crController.updateDraft);
router.get('/:id/workflow-history', authenticateToken, crController.getWorkflowHistory);
router.post('/:id/submit', authenticateToken, authorizeRoles(['PM']), crController.submitDraft);
router.post('/:id/approve', authenticateToken, crController.approveChangeRequest);
router.post('/:id/return', authenticateToken, crController.returnChangeRequest);
router.post('/:id/reject', authenticateToken, crController.rejectChangeRequest);

module.exports = router;
