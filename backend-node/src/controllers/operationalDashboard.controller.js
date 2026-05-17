const operationalDashboardService = require('../services/operationalDashboard.service');

async function getDashboard(req, res) {
  try {
    return res.json(await operationalDashboardService.getDashboard(req.user, req.query || {}));
  } catch (error) {
    console.error('Operational dashboard failed:', error);
    return res.status(error.status || 500).json({
      message: error.message || 'Failed to load operational dashboard',
    });
  }
}

module.exports = {
  getDashboard,
};
