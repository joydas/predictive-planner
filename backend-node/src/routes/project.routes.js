const express = require('express');
const projectController = require('../controllers/project.controller');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', authenticateToken, projectController.listMyProjects);
router.get('/available-for-cr', authenticateToken, projectController.listProjectsAvailableForCr);
router.post('/ml-recommendation', authenticateToken, projectController.getMlRecommendation);
router.post('/draft', authenticateToken, authorizeRoles(['PM']), projectController.createDraft);
router.put('/:id/draft', authenticateToken, authorizeRoles(['PM']), projectController.updateDraft);
router.get('/:id/draft', authenticateToken, projectController.getDraft);
router.post('/submit', authenticateToken, authorizeRoles(['PM']), projectController.submitProject);
router.get('/:id/progress', authenticateToken, authorizeRoles(['PM']), projectController.getProjectProgress);
router.post('/:id/progress', authenticateToken, authorizeRoles(['PM']), projectController.saveProjectProgress);
router.get('/:id/forecast', authenticateToken, projectController.getProjectForecast);
router.get('/:id', authenticateToken, projectController.getProject);
router.get('/:id/workflow-history', authenticateToken, projectController.getWorkflowHistory);
router.post('/:id/submit', authenticateToken, projectController.submitExistingProject);
router.post('/:id/approve', authenticateToken, projectController.approveProject);
router.post('/:id/return', authenticateToken, projectController.returnProject);
router.post('/:id/reject', authenticateToken, projectController.rejectProject);
router.post('/:id/complete', authenticateToken, authorizeRoles(['PM']), projectController.completeProject);

module.exports = router;
