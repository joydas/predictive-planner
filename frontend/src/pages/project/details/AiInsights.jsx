import React from 'react';
import { CAlert, CBadge, CProgress, CTooltip } from '@coreui/react';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { formatCurrency } from '../../../utils/resourcePlanning';

const InsightPanel = ({ title, icon, children }) => (
  <div className="insight-panel">
    <div className="insight-panel-header">
      {icon && <span className="me-2">{icon}</span>}
      <strong>{title}</strong>
    </div>
    <div className="insight-panel-body">
      {children}
    </div>
  </div>
);

const AiInsights = ({ recommendation, forecast, deliveryRisk, similarProjectsCount }) => {
  const prob = deliveryRisk?.probability;
  const riskLevel = deliveryRisk?.riskLevel || 'Unknown';
  
  return (
    <div className="section-container">
      <div className="section-header">
        <h4>AI Insights</h4>
      </div>
      <div className="section-body">
        <div className="insight-grid">
          <InsightPanel title="Resource Recommendation" icon="👥">
            {recommendation ? (
              <>
                <div className="mb-2">
                  <span className="text-muted small">Recommended Team Size:</span>
                  <span className="ms-2 fw-bold">{recommendation.recommended_team_size}</span>
                </div>
                <div className="text-muted small">
                  {recommendation.team?.length > 0 
                    ? `Suggested ${recommendation.team.length} specialized roles for optimal delivery.`
                    : 'No specific role suggestions available.'}
                </div>
              </>
            ) : (
              <div className="text-muted small italic">No recommendation data.</div>
            )}
          </InsightPanel>

          <InsightPanel title="Forecast Summary" icon="📈">
            {forecast?.completionDate?.forecastAvailable ? (
              <>
                <div className="mb-1 small">
                  <strong>Expected Finish:</strong> {formatDisplayDate(forecast.completionDate.forecastCompletionDate)}
                </div>
                <div className="mb-1 small">
                  <strong>Expected Delay:</strong> {forecast.completionDate.forecastDelayDays} Days
                </div>
                <div className="text-muted small">
                  Confidence: {forecast.completionDate.confidence}%
                </div>
              </>
            ) : (
              <div className="text-muted small italic">Insufficient data for forecasting.</div>
            )}
          </InsightPanel>

          <InsightPanel title="Delivery Risk" icon="⚠️">
            {deliveryRisk?.available ? (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="fw-bold">{prob}% On-Time</span>
                  <CBadge color={riskLevel === 'LOW' ? 'success' : riskLevel === 'MODERATE' ? 'warning' : 'danger'}>
                    {riskLevel}
                  </CBadge>
                </div>
                <CProgress value={prob} className="mb-2" style={{ height: '8px' }} />
                <div className="text-muted small">
                  <strong>AI Explanation:</strong>{' '}
                  {deliveryRisk.explanation?.length > 0 
                    ? deliveryRisk.explanation[0] 
                    : 'Derived from historical patterns and current signals.'}
                </div>
              </>
            ) : (
              <div className="text-muted small italic">Risk assessment unavailable.</div>
            )}
          </InsightPanel>

          <InsightPanel title="Historical Similarity" icon="🔍">
            <div className="mb-2">
              <span className="fw-bold">{similarProjectsCount}</span>
              <span className="ms-2 text-muted small">Similar Projects Found</span>
            </div>
            <div className="text-muted small">
              Similarity is based on industry, tech stack, and complexity.
            </div>
          </InsightPanel>
        </div>
      </div>
    </div>
  );
};

export default AiInsights;
