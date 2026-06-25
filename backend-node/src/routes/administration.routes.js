const express = require('express');
const organizationController = require('../controllers/organization.controller');
const userAdminController = require('../controllers/userAdmin.controller');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticateToken);

router.get('/organizations/options', authorizeRoles(['SUPER_ADMIN', 'ADMIN']), organizationController.listOrganizationOptions);
router.get('/organizations', authorizeRoles(['SUPER_ADMIN']), organizationController.listOrganizations);
router.post('/organizations', authorizeRoles(['SUPER_ADMIN']), organizationController.createOrganization);
router.put('/organizations/:organizationId', authorizeRoles(['SUPER_ADMIN']), organizationController.updateOrganization);
router.get('/organizations/:organizationId/summary', authorizeRoles(['SUPER_ADMIN', 'ADMIN']), organizationController.getOrganizationSummary);

router.get('/users', authorizeRoles(['SUPER_ADMIN', 'ADMIN']), userAdminController.listUsers);
router.post('/users', authorizeRoles(['SUPER_ADMIN', 'ADMIN']), userAdminController.createUser);
router.put('/users/:userId', authorizeRoles(['SUPER_ADMIN', 'ADMIN']), userAdminController.updateUser);
router.post('/users/:userId/reset-password', authorizeRoles(['SUPER_ADMIN', 'ADMIN']), userAdminController.resetPassword);

module.exports = router;
