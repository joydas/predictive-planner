// Utility functions for project variance and risk calculation

/**
 * Calculate variance percentage between predicted and estimated hours
 * @param {number} predicted - Predicted hours
 * @param {number} estimated - Estimated hours
 * @returns {number} Variance percentage
 */
export const calculateVariance = (predicted, estimated) => {
  if (!estimated || estimated === 0) return 0;
  return ((predicted - estimated) / estimated) * 100;
};

/**
 * Get risk level based on variance percentage
 * @param {number} variance - Variance percentage
 * @returns {string} Risk level: 'Low', 'Medium', 'High', 'Critical'
 */
export const getRiskLevel = (variance) => {
  const absVariance = Math.abs(variance);
  if (absVariance <= 10) return 'Low';
  if (absVariance <= 30) return 'Medium';
  if (absVariance <= 50) return 'High';
  return 'Critical';
};

/**
 * Get Bootstrap color class for risk level
 * @param {string} riskLevel - Risk level
 * @returns {string} Bootstrap color class
 */
export const getRiskColor = (riskLevel) => {
  switch (riskLevel) {
    case 'Low': return 'success';
    case 'Medium': return 'warning';
    case 'High': return 'risk-high';
    case 'Critical': return 'danger';
    default: return 'secondary';
  }
};

/**
 * Format variance for display
 * @param {number} variance - Variance percentage
 * @returns {string} Formatted variance string
 */
export const formatVariance = (variance) => {
  const sign = variance >= 0 ? '+' : '';
  return `${sign}${variance.toFixed(1)}%`;
};