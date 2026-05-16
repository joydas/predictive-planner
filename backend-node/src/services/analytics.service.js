const analyticsRepository = require('../repositories/analytics.repository');
const mlPredictionService = require('./mlPrediction.service');

module.exports = {
  getPmSummary: (user) => analyticsRepository.getPmSummary(user.userId),
  getAmSummary: (user) => analyticsRepository.getAmSummary(user.userId),
  getMlAccuracy: () => analyticsRepository.getMlAccuracy(),
  getProjectRisk: () => analyticsRepository.getProjectRisk(),
  getCrTrends: () => analyticsRepository.getCrTrends(),
  recordActualOutcome: (payload) => mlPredictionService.recordActualOutcome(payload),
};
