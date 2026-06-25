const aiInsightService = require('../services/aiInsightService');
const mlPredictionService = require('../services/mlPrediction.service');
const similarProjectService = require('../services/similarProjectService');
const forecastService = require('../services/forecastService');
const projectService = require('../services/project.service');
const TenantContext = require('../utils/tenantContext');

async function getProjectInsights(req, res) {
  try {
    const projectId = Number(req.params.id);
    if (!projectId) {
      return res.status(400).json({ message: 'Project id is required' });
    }

    const organizationId = TenantContext.getOrganizationId();

    // Fetch all necessary data in parallel
    const [similar, forecast, progressData, projectData] = await Promise.all([
      similarProjectService.getSimilarHistoricalProjects(req.user, projectId),
      forecastService.getProjectForecast(req.user, projectId),
      projectService.getProjectProgress(projectId, req.user).catch(() => ({ snapshots: [], latestSnapshot: null, expectedCompletionPercent: 0 })),
      projectService.getProject(projectId, organizationId).catch(() => null),
    ]);

    // Build progress context with expected completion percent
    const progress = {
      ...progressData,
      latestSnapshot: progressData.latestSnapshot || progressData.selectedSnapshot || (progressData.snapshots && progressData.snapshots.length > 0 ? progressData.snapshots[0] : null),
      expectedCompletionPercent: progressData.expectedCompletionPercent || progressData.currentApprovedValues?.expectedCompletionPercent || 0,
    };

    // Calculate expected completion if not provided
    if (!progress.expectedCompletionPercent && progressData.currentApprovedValues) {
      const cv = progressData.currentApprovedValues;
      const start = cv.startDate ? new Date(`${cv.startDate}T00:00:00`) : null;
      const now = new Date();
      const duration = Number(cv.plannedDuration || 0);
      if (start && duration > 0 && !isNaN(start.getTime())) {
        const elapsed = Math.max(0, (now - start) / 86400000);
        progress.expectedCompletionPercent = Math.min(100, Math.max(0, (elapsed / duration) * 100));
      }
    }

    const budget = projectData?.project?.budget || projectData?.budget || progressData?.currentApprovedValues?.plannedBudget || 0;

    // Generate context-aware insights
    const insights = [
      aiInsightService.getScheduleForecastInsight(forecast, progress),
      aiInsightService.getCostForecastInsight(forecast, progress, budget),
      aiInsightService.getResourceRecommendation(forecast, progress, forecast.mlRecommendation, projectId),
    ];

    return res.json({ insights });
  } catch (error) {
    console.error('Insight generation failed:', error);
    return res.status(500).json({ message: 'Failed to generate insights' });
  }
}

module.exports = {
  getProjectInsights,
};
