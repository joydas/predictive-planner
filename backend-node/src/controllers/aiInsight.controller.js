const aiInsightService = require('../services/aiInsightService');
const mlPredictionService = require('../services/mlPrediction.service');
const similarProjectService = require('../services/similarProjectService');
const forecastService = require('../services/forecastService');

async function getProjectInsights(req, res) {
  try {
    const projectId = Number(req.params.id);
    if (!projectId) {
      return res.status(400).json({ message: 'Project id is required' });
    }

    // Fetch necessary data
    // Note: Assuming these services exist and are accessible. 
    // In a real scenario, we might need to fetch project details first.
    const [similar, forecast] = await Promise.all([
      similarProjectService.getSimilarHistoricalProjects(req.user, projectId),
      forecastService.getProjectForecast(req.user, projectId)
    ]);

    //return res.json({ forecast });

    // Generate insights
    const insights = [
      aiInsightService.getResourceInsight(forecast.mlRecommendation, similar.similarProjects.length),
      aiInsightService.getForecastInsight(forecast.forecastCompletionDate, forecast.plannedCompletionDate, similar.similarProjects.length )
    ];
    //console.log(forecast);
    return res.json({ insights });
  } catch (error) {
    console.error('Insight generation failed:', error);
    return res.status(500).json({ message: 'Failed to generate insights' });
  }
}

module.exports = {
  getProjectInsights,
};
