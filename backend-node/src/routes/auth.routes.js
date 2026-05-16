const express = require('express');
const authController = require('../controllers/auth.controller');

const router = express.Router();

// Auth route namespace for modular route organization
router.post('/login', authController.login);

module.exports = router;
