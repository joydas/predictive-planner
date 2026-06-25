const express = require('express');
const router = express.Router();
const aiInsightController = require('../controllers/aiInsight.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

router.get('/:id', authenticateToken, aiInsightController.getProjectInsights);

module.exports = router;
