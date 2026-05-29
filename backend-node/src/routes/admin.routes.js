const express = require('express');
const adminController = require('../controllers/admin.controller');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(authenticateToken, authorizeRoles(['ADMIN']));
router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);
router.put('/users/:userId', adminController.updateUser);

module.exports = router;
