
const RISK_CONFIG = require('../config/riskConfig');

class AiInsightService {
  /**
   * Determines the project health context from progress data.
   * Returns: 'completed' | 'ahead' | 'on_track' | 'slightly_behind' | 'behind' | 'no_data'
   */
  _getProjectHealthContext(progress) {
    if (!progress || !progress.latestSnapshot) return 'no_data';
    const completionPct = Number(progress.latestSnapshot.actualCompletionPercent || 0);
    if (completionPct >= 100) return 'completed';

    const expectedPct = Number(progress.expectedCompletionPercent || 0);
    if (expectedPct <= 0) return 'no_data';

    const delta = completionPct - expectedPct;
    if (delta >= RISK_CONFIG.healthThresholds.ahead) return 'ahead';
    if (delta >= RISK_CONFIG.healthThresholds.onTrack) return 'on_track';
    if (delta >= RISK_CONFIG.healthThresholds.slightlyBehind) return 'slightly_behind';
    return 'behind';
  }

  /**
   * Generates a context-aware schedule forecast insight.
   */
  getScheduleForecastInsight(forecast, progress) {
    const health = this._getProjectHealthContext(progress);
    const completionPct = Number(progress?.latestSnapshot?.actualCompletionPercent || 0);
    const completion = forecast?.completionDate || forecast || {};

    // Project already completed
    if (health === 'completed') {
      return {
        type: 'schedule_forecast',
        title: 'Schedule Forecast',
        summary: 'Project is 100% complete. No schedule risk remaining.',
        confidence: 'High',
        status: 'on_track',
        supportingEvidence: 'Based on reported project completion at 100%.',
        forecastDelayDays: 0,
        forecastCompletionDate: null,
      };
    }

    const forecastAvailable = completion.forecastAvailable !== false;
    const delayDays = Number(completion.forecastDelayDays || 0);
    const forecastDate = completion.forecastCompletionDate || null;

    // If project is ahead and ML says delay, temper the message
    if (health === 'ahead' && delayDays > 0) {
      return {
        type: 'schedule_forecast',
        title: 'Schedule Forecast',
        summary: `Current progress (${completionPct.toFixed(0)}%) is ahead of schedule. While similar projects have experienced delays, your trajectory is positive. Continue current pace to maintain the lead.`,
        confidence: 'Medium',
        status: 'on_track',
        supportingEvidence: `Project is ${(completionPct - Number(progress.expectedCompletionPercent || 0)).toFixed(0)}% ahead of expected timeline. ML model suggests ${delayDays} day(s) delay based on similar project patterns, but current momentum is strong.`,
        forecastDelayDays: 0,
        forecastCompletionDate: forecastDate,
      };
    }

    // If project is on track
    if (health === 'on_track') {
      return {
        type: 'schedule_forecast',
        title: 'Schedule Forecast',
        summary: forecastAvailable && delayDays > 0
          ? `Project is currently on track (${completionPct.toFixed(0)}% complete). Minor risk of ${delayDays} day(s) delay detected from historical patterns. Maintain current velocity.`
          : `Project is on track with ${completionPct.toFixed(0)}% completion. No significant schedule risk detected.`,
        confidence: forecastAvailable ? 'Medium' : 'Low',
        status: delayDays > RISK_CONFIG.scheduleDelayThresholds.atRisk ? 'at_risk' : 'on_track',
        supportingEvidence: forecastAvailable
          ? `Based on current trajectory and comparison with similar past projects.`
          : 'Forecast model data unavailable. Assessment based on progress alone.',
        forecastDelayDays: Math.max(0, delayDays),
        forecastCompletionDate: forecastDate,
      };
    }

    // Project is behind schedule - use ML forecast directly
    if (!forecastAvailable) {
      return {
        type: 'schedule_forecast',
        title: 'Schedule Forecast',
        summary: `Project is at ${completionPct.toFixed(0)}% completion which is below the expected progress. Forecast model is currently unavailable for detailed prediction.`,
        confidence: 'Low',
        status: 'at_risk',
        supportingEvidence: 'Progress data indicates the project is behind schedule.',
        forecastDelayDays: null,
        forecastCompletionDate: null,
      };
    }

    const weeksDiff = Math.ceil(delayDays / 7);
    return {
      type: 'schedule_forecast',
      title: 'Schedule Forecast',
      summary: delayDays > 0
        ? `Project is behind schedule at ${completionPct.toFixed(0)}% completion. Forecasted delay of ${delayDays} day(s) (~${weeksDiff} week${weeksDiff > 1 ? 's' : ''}). Immediate attention recommended.`
        : `Project at ${completionPct.toFixed(0)}% completion. Delivery is currently aligned with plan despite being slightly behind expected progress.`,
      confidence: 'High',
      status: delayDays > RISK_CONFIG.scheduleDelayThresholds.critical ? 'critical' : delayDays > 0 ? 'at_risk' : 'on_track',
      supportingEvidence: `Forecast based on current trajectory, progress patterns, and ${completion.similarProjectsUsed || 'historical'} similar projects.`,
      forecastDelayDays: Math.max(0, delayDays),
      forecastCompletionDate: forecastDate,
    };
  }

  /**
   * Generates a context-aware cost forecast insight.
   */
  getCostForecastInsight(forecast, progress, projectBudget) {
    const health = this._getProjectHealthContext(progress);
    const completionPct = Number(progress?.latestSnapshot?.actualCompletionPercent || 0);
    const actualBudget = Number(progress?.latestSnapshot?.actualBudget || 0);
    const budget = Number(projectBudget || 0);
    const budgetForecast = forecast?.finalBudget || {};

    // Project completed
    if (health === 'completed') {
      const variance = budget > 0 ? ((actualBudget - budget) / budget * 100).toFixed(1) : 0;
      const overUnder = actualBudget > budget ? 'over' : actualBudget < budget ? 'under' : 'on';
      return {
        type: 'cost_forecast',
        title: 'Cost Forecast',
        summary: `Project completed. Final cost: ${this._formatCurrency(actualBudget)} (${overUnder} budget by ${Math.abs(variance)}%).`,
        confidence: 'High',
        status: overUnder === 'over' ? 'at_risk' : 'on_track',
        supportingEvidence: `Planned budget: ${this._formatCurrency(budget)}. Actual: ${this._formatCurrency(actualBudget)}.`,
        forecastFinalBudget: actualBudget,
        budgetVariancePercent: Number(variance),
      };
    }

    // Calculate burn rate analysis
    const burnRatio = (completionPct > 0 && budget > 0)
      ? (actualBudget / budget) / (completionPct / 100)
      : null;

    const forecastBudget = budgetForecast.forecastAvailable !== false
      ? Number(budgetForecast.forecastFinalBudget || 0)
      : (burnRatio ? budget * burnRatio : 0);


    const budgetVariancePct = budget > 0 ? ((forecastBudget - budget) / budget * 100).toFixed(1) : 0;

    // Ahead of schedule - cost is likely under control
    if (health === 'ahead' && burnRatio && burnRatio <= 1.05) {
      return {
        type: 'cost_forecast',
        title: 'Cost Forecast',
        summary: `Cost is well controlled. Spent ${this._formatCurrency(actualBudget)} of ${this._formatCurrency(budget)} (${completionPct.toFixed(0)}% complete). Current burn rate suggests potential savings.`,
        confidence: 'Medium',
        status: 'on_track',
        supportingEvidence: `Burn rate efficiency: ${((burnRatio || 0) * 100).toFixed(0)}%. Projected final cost: ${this._formatCurrency(forecastBudget)}.`,
        forecastFinalBudget: forecastBudget,
        budgetVariancePercent: Number(budgetVariancePct),
      };
    }

    // Behind or at risk
    let costStatus = 'on_track';
    let costSummary = '';

    if (burnRatio && burnRatio > RISK_CONFIG.costOverrunThresholds.critical) {
      costStatus = 'critical';
      costSummary = `Cost overrun risk detected. Spent ${this._formatCurrency(actualBudget)} at ${completionPct.toFixed(0)}% completion. At current burn rate, projected final cost is ${this._formatCurrency(forecastBudget)} (${budgetVariancePct}% over budget).`;
    } else if (burnRatio && burnRatio > RISK_CONFIG.costOverrunThresholds.atRisk) {
      costStatus = 'at_risk';
      costSummary = `Slight cost pressure detected. Spent ${this._formatCurrency(actualBudget)} at ${completionPct.toFixed(0)}% completion. Projected final cost: ${this._formatCurrency(forecastBudget)} (${budgetVariancePct}% variance).`;
    } else {
      costSummary = `Cost tracking within plan. Spent ${this._formatCurrency(actualBudget)} of ${this._formatCurrency(budget)} at ${completionPct.toFixed(0)}% completion. Projected final cost: ${this._formatCurrency(forecastBudget)}.`;
    }

    return {
      type: 'cost_forecast',
      title: 'Cost Forecast',
      summary: costSummary,
      confidence: budgetForecast.forecastAvailable !== false ? 'Medium' : 'Low',
      status: costStatus,
      supportingEvidence: burnRatio
        ? `Burn rate: ${(burnRatio * 100).toFixed(0)}% of ideal. Budget utilisation: ${budget > 0 ? ((actualBudget / budget) * 100).toFixed(1) : 0}%.`
        : 'Insufficient data for burn rate analysis.',
      forecastFinalBudget: forecastBudget,
      budgetVariancePercent: Number(budgetVariancePct),
    };
  }

  /**
   * Generates resource loading recommendation based on project status.
   */
  getResourceRecommendation(forecast, progress, recommendation, projectId) {
    const health = this._getProjectHealthContext(progress);
    const completionPct = Number(progress?.latestSnapshot?.actualCompletionPercent || 0);
    const mlStaffing = recommendation?.staffing || {};
    const totalRecommended = Object.values(mlStaffing.recommendedTeam || {}).reduce((sum, c) => sum + Number(c), 0);
    const actualTeamSize = Number(progress?.latestSnapshot?.actualTeamSize || 0);
    const teamSize = actualTeamSize || Number(progress?.currentApprovedValues?.plannedTeamSize || 0) || 1;
    const plannedDuration = Number(progress?.currentApprovedValues?.plannedDuration || 0);
    const expectedPct = Number(progress?.expectedCompletionPercent || 0);
    const delayDays = Number(forecast?.completionDate?.forecastDelayDays || forecast?.forecastDelayDays || 0);

    const crLink = `/crs/create?projectId=${projectId}`;

    // Completed
    if (health === 'completed') {
      return {
        type: 'resource_recommendation',
        title: 'Resource Recommendation',
        summary: 'Project is complete. All resources can be released.',
        confidence: 'High',
        status: 'on_track',
        supportingEvidence: 'Project at 100% completion.',
        action: 'release',
        crLink,
        resourceDelta: actualTeamSize > 0 ? -actualTeamSize : 0,
        suggestedTeamSize: 0,
      };
    }

    // Behind schedule - recommend adding resources or extending allocation
    if (health === 'behind' || health === 'slightly_behind') {
      const urgency = health === 'behind' ? 'Urgent' : 'Recommended';
      
      let calculatedDelayDays = delayDays;
      if (calculatedDelayDays <= 0 && plannedDuration > 0) {
        const pctGap = expectedPct - completionPct;
        if (pctGap > 0) {
          calculatedDelayDays = Math.ceil((pctGap / 100) * plannedDuration);
        }
      }
      if (calculatedDelayDays <= 0) {
        calculatedDelayDays = 1;
      }

      const allocationExtensionDays = Number((calculatedDelayDays / teamSize).toFixed(1));
      const additionalDevsNeeded = Math.ceil(calculatedDelayDays);
      const suggestedSize = teamSize + additionalDevsNeeded;

      return {
        type: 'resource_recommendation',
        title: 'Resource Recommendation',
        summary: `${urgency}: Project is behind schedule by ${calculatedDelayDays} day(s) (${completionPct.toFixed(0)}% vs expected ${expectedPct.toFixed(0)}%). To bring it back on track, you can either extend the resource allocation by ${allocationExtensionDays} day(s) for the existing team of ${teamSize}, or add ${additionalDevsNeeded} developer(s). Submit a Change Request to update resource loading.`,
        confidence: health === 'behind' ? 'High' : 'Medium',
        status: health === 'behind' ? 'critical' : 'at_risk',
        supportingEvidence: `Current team: ${teamSize}. Calculated schedule gap: ${calculatedDelayDays} day(s). Either extend allocation duration or add devs to recover the gap.`,
        action: 'add',
        crLink,
        resourceDelta: additionalDevsNeeded,
        suggestedTeamSize: suggestedSize,
      };
    }

    // Ahead of schedule - recommend shortening allocation or releasing resources
    if (health === 'ahead') {
      let calculatedAheadDays = delayDays < 0 ? Math.abs(delayDays) : 0;
      if (calculatedAheadDays <= 0 && plannedDuration > 0) {
        const pctAhead = completionPct - expectedPct;
        if (pctAhead > 0) {
          calculatedAheadDays = Math.ceil((pctAhead / 100) * plannedDuration);
        }
      }
      if (calculatedAheadDays <= 0) {
        calculatedAheadDays = 1;
      }

      const allocationReductionDays = Number((calculatedAheadDays / teamSize).toFixed(1));
      const releasableDevs = Math.max(0, Math.min(teamSize - 1, Math.floor(calculatedAheadDays)));
      const suggestedSize = Math.max(1, teamSize - releasableDevs);

      let summary = `Project is ahead of schedule by ${calculatedAheadDays} day(s) (${completionPct.toFixed(0)}% vs expected ${expectedPct.toFixed(0)}%). You can shorten the resource allocation by ${allocationReductionDays} day(s) to finish early.`;
      let action = 'maintain';
      let delta = 0;
      if (releasableDevs > 0) {
        summary = `Project is ahead of schedule by ${calculatedAheadDays} day(s) (${completionPct.toFixed(0)}% vs expected ${expectedPct.toFixed(0)}%). You can either shorten the resource allocation by ${allocationReductionDays} day(s), or release ${releasableDevs} developer(s), reducing the team size to ${suggestedSize}. Submit a Change Request to update resource loading.`;
        action = 'release';
        delta = -releasableDevs;
      }

      return {
        type: 'resource_recommendation',
        title: 'Resource Recommendation',
        summary,
        confidence: 'Medium',
        status: 'on_track',
        supportingEvidence: `Current team: ${teamSize}. Progress is ahead by ${(completionPct - expectedPct).toFixed(0)}% or ${calculatedAheadDays} day(s).`,
        action,
        crLink,
        resourceDelta: delta,
        suggestedTeamSize: suggestedSize,
      };
    }

    // On track
    return {
      type: 'resource_recommendation',
      title: 'Resource Recommendation',
      summary: `Team size is appropriate for current project trajectory. Current team of ${teamSize} is aligned with project needs.`,
      confidence: 'Medium',
      status: 'on_track',
      supportingEvidence: `ML recommended team size: ${totalRecommended || 'N/A'}. Current progress is on track.`,
      action: 'maintain',
      crLink,
      resourceDelta: 0,
      suggestedTeamSize: teamSize,
    };
  }

  _formatCurrency(value) {
    const num = Number(value || 0);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  }
}

module.exports = new AiInsightService();
