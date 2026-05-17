const express = require('express');
const operationalDashboardController = require('../controllers/operationalDashboard.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', authenticateToken, operationalDashboardController.getDashboard);

module.exports = router;
