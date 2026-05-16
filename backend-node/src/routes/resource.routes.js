const express = require('express');
const resourceController = require('../controllers/resource.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/', authenticateToken, resourceController.listResources);
router.get('/availability', authenticateToken, resourceController.getAvailability);
router.get('/utilization', authenticateToken, resourceController.getUtilization);
router.get('/bench', authenticateToken, resourceController.getBench);
router.get('/allocations', authenticateToken, resourceController.listAllocations);
router.post('/allocations', authenticateToken, resourceController.createAllocation);

module.exports = router;
