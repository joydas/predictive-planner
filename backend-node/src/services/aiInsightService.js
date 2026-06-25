
class AiInsightService {
  /**
   * Generates a business-readable resource insight.
   * @param {Object} mlRecommendation - The ML prediction output.
   * @param {number} similarProjectsCount - Number of similar projects.
   */
  getResourceInsight(mlRecommendation, similarProjectsCount = 0) {
    const staffing = mlRecommendation?.staffing || {};
    const totalRecommended = Object.values(staffing.recommendedTeam || {}).reduce((sum, count) => sum + Number(count), 0);
    
    return {
      title: "Resource Recommendation",
      summary: `AI recommends a team size of ${totalRecommended} based on ${similarProjectsCount} similar completed projects.`,
      confidence: "High", // Placeholder, map to actual ML confidence if available
      supportingEvidence: `Aggregation of ${similarProjectsCount} similar projects historical data.`
    };
  }

  /**
   * Generates a business-readable forecast insight.
   * @param {Object} forecast - The forecast prediction output.
   * @param {Date} plannedDate - Planned completion date.
   */
  getForecastInsight(completionDate, plannedDate, similarProjectsCount = 0) {
    const predictedDate = new Date(completionDate);
    const timeDiff = predictedDate - new Date(plannedDate);
    const weeksDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24 * 7));
    
    let summary = `Forecasted completion is aligned with the plan`;
    if (weeksDiff > 0) {
      summary = `Current delivery patterns indicate a likely completion ${weeksDiff} week${weeksDiff > 1 ? 's' : ''} later than planned.`;
    }
    
    return {
      title: "Forecast Insight",
      summary,
      confidence: "Medium",
      supportingEvidence: `Based on current trajectory compared against ${similarProjectsCount} similar past projects.`
    };
  }
}

module.exports = new AiInsightService();
