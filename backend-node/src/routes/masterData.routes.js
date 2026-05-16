const express = require('express');
const masterDataController = require('../controllers/masterData.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/planning', authenticateToken, masterDataController.getPlanningMasterData);

module.exports = router;
