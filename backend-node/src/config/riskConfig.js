const RISK_CONFIG = {
  healthThresholds: {
    ahead: 5,
    onTrack: -5,
    slightlyBehind: -15,
  },
  scheduleDelayThresholds: {
    critical: 50,
    atRisk: 7,
  },
  costOverrunThresholds: {
    critical: 1.15,
    atRisk: 1.05,
  },
  statusColors: {
    on_track: { bg: '#e6f9ed', border: '#34d399', badge: 'success', label: 'On Track' },
    at_risk: { bg: '#fff7e6', border: '#f59e0b', badge: 'warning', label: 'At Risk' },
    critical: { bg: '#fee2e2', border: '#ef4444', badge: 'danger', label: 'Critical' },
  }
};

module.exports = RISK_CONFIG;
