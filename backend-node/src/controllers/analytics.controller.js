const analyticsService = require('../services/analytics.service');

function handler(fn, label) {
  return async (req, res) => {
    try {
      return res.json(await fn(req));
    } catch (error) {
      console.error(`${label} analytics failed:`, error);
      return res.status(error.status || 500).json({ message: error.message || `Failed to load ${label} analytics` });
    }
  };
}

module.exports = {
  pmSummary: handler((req) => analyticsService.getPmSummary(req.user), 'PM summary'),
  amSummary: handler((req) => analyticsService.getAmSummary(req.user), 'AM summary'),
  mlAccuracy: handler(() => analyticsService.getMlAccuracy(), 'ML accuracy'),
  projectRisk: handler(() => analyticsService.getProjectRisk(), 'project risk'),
  crTrends: handler(() => analyticsService.getCrTrends(), 'CR trend'),
  varianceDashboard: handler((req) => analyticsService.getVarianceDashboard(req.user, req.query || {}), 'variance dashboard'),
  recordActualOutcome: handler(async (req) => {
    const affectedRows = await analyticsService.recordActualOutcome(req.body || {});
    return { message: 'Actual outcome captured', affectedRows };
  }, 'actual outcome'),
};
