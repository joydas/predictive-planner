const express = require('express');
const adminController = require('../controllers/admin.controller');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticateToken, authorizeRoles(['ADMIN']));
router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);
router.put('/users/:userId', adminController.updateUser);
router.get('/ml', adminController.getMlAdministration);
router.post('/ml/retrain', adminController.retrainMlModels);
router.get('/ml/jobs/:jobId', adminController.getMlTrainingJob);
router.get('/data/projects', adminController.listDataManagementProjects);
router.get('/data/projects/delete-summary', adminController.getProjectDeleteSummary);
router.delete('/data/projects', adminController.deleteProject);
router.post('/data/projects/bulk-delete', adminController.bulkDeleteProjects);

module.exports = router;
