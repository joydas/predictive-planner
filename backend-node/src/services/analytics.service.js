const analyticsRepository = require('../repositories/analytics.repository');
const mlPredictionService = require('./mlPrediction.service');

module.exports = {
  getPmSummary: (user) => analyticsRepository.getPmSummary(user),
  getAmSummary: (user) => analyticsRepository.getAmSummary(user),
  getMlAccuracy: (user) => analyticsRepository.getMlAccuracy(user),
  getProjectRisk: (user) => analyticsRepository.getProjectRisk(user),
  getCrTrends: (user) => analyticsRepository.getCrTrends(user),
  getVarianceDashboard: (user, query) => analyticsRepository.getVarianceDashboard(user, query),
  recordActualOutcome: (payload) => mlPredictionService.recordActualOutcome(payload),
};
