const express = require('express');
const analyticsController = require('../controllers/analytics.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/pm-summary', authenticateToken, analyticsController.pmSummary);
router.get('/am-summary', authenticateToken, analyticsController.amSummary);
router.get('/ml-accuracy', authenticateToken, analyticsController.mlAccuracy);
router.get('/project-risk', authenticateToken, analyticsController.projectRisk);
router.get('/cr-trends', authenticateToken, analyticsController.crTrends);
router.get('/variance-dashboard', authenticateToken, analyticsController.varianceDashboard);
router.post('/prediction-feedback', authenticateToken, analyticsController.recordActualOutcome);

module.exports = router;
