const express = require('express');
const projectController = require('../controllers/project.controller');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

router.post('/draft', authenticateToken, projectController.createDraft);
router.put('/:id/draft', authenticateToken, projectController.updateDraft);
router.get('/:id/draft', authenticateToken, projectController.getDraft);
router.post('/submit', authenticateToken, projectController.submitProject);

module.exports = router;
