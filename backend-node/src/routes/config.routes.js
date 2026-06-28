const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.middleware');
const riskConfig = require('../config/riskConfig');

router.get('/risk', authenticateToken, (req, res) => {
  res.json(riskConfig);
});

module.exports = router;
