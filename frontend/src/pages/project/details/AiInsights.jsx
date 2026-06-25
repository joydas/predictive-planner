import React, { useState, useEffect } from 'react';
import { CAlert, CBadge, CButton, CSpinner } from '@coreui/react';
import { useNavigate } from 'react-router-dom';
import { getProjectInsights } from '../../../services/projectService';

const statusColors = {
  on_track: { bg: '#e6f9ed', border: '#34d399', badge: 'success', label: 'On Track' },
  at_risk: { bg: '#fff7e6', border: '#f59e0b', badge: 'warning', label: 'At Risk' },
  critical: { bg: '#fee2e2', border: '#ef4444', badge: 'danger', label: 'Critical' },
};

const typeIcons = {
  schedule_forecast: '\ud83d\udcc5',
  cost_forecast: '\ud83d\udcb0',
  resource_recommendation: '\ud83d\udc65',
};

const getConfidenceColor = (confidence) => {
  if (!confidence) return 'secondary';
  const c = String(confidence).toLowerCase();
  if (c === 'high') return 'success';
  if (c === 'medium') return 'warning';
  if (c === 'low') return 'danger';
  return 'secondary';
};

const InsightCard = ({ insight, navigate }) => {
  const colors = statusColors[insight.status] || statusColors.on_track;
  const icon = typeIcons[insight.type] || '\ud83d\udca1';

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${colors.border}`,
      borderLeft: `4px solid ${colors.border}`,
      borderRadius: '0.5rem',
      padding: '1rem 1.25rem',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      transition: 'all 0.2s ease',
      boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
    }}
    onMouseOver={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
    onMouseOut={(e) => { e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.3rem' }}>{icon}</span>
          <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>{insight.title}</strong>
        </div>
        <CBadge color={colors.badge} shape="rounded-pill" style={{ fontSize: '0.7rem' }}>
          {colors.label}
        </CBadge>
      </div>

      {/* Summary */}
      <div style={{ fontSize: '0.9rem', lineHeight: '1.5', color: '#334155', marginBottom: '0.75rem', flexGrow: 1 }}>
        {insight.summary}
      </div>

      {/* Metrics row for schedule forecast */}
      {insight.type === 'schedule_forecast' && insight.forecastDelayDays !== null && insight.forecastDelayDays !== undefined && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ background: colors.bg, padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem' }}>
            <span style={{ color: '#64748b' }}>Delay: </span>
            <strong>{insight.forecastDelayDays} day(s)</strong>
          </div>
          {insight.forecastCompletionDate && (
            <div style={{ background: colors.bg, padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem' }}>
              <span style={{ color: '#64748b' }}>Forecast: </span>
              <strong>{new Date(insight.forecastCompletionDate).toLocaleDateString()}</strong>
            </div>
          )}
        </div>
      )}

      {/* Metrics row for cost forecast */}
      {insight.type === 'cost_forecast' && insight.forecastFinalBudget !== null && insight.forecastFinalBudget !== undefined && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ background: colors.bg, padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem' }}>
            <span style={{ color: '#64748b' }}>Projected Cost: </span>
            <strong>${Number(insight.forecastFinalBudget).toLocaleString()}</strong>
          </div>
          {insight.budgetVariancePercent !== null && insight.budgetVariancePercent !== undefined && (
            <div style={{ background: colors.bg, padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem' }}>
              <span style={{ color: '#64748b' }}>Variance: </span>
              <strong style={{ color: Number(insight.budgetVariancePercent) > 5 ? '#ef4444' : Number(insight.budgetVariancePercent) < -5 ? '#22c55e' : '#64748b' }}>
                {Number(insight.budgetVariancePercent) > 0 ? '+' : ''}{insight.budgetVariancePercent}%
              </strong>
            </div>
          )}
        </div>
      )}

      {/* Metrics row for resource recommendation */}
      {insight.type === 'resource_recommendation' && insight.suggestedTeamSize !== null && insight.suggestedTeamSize !== undefined && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ background: colors.bg, padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem' }}>
            <span style={{ color: '#64748b' }}>Suggested Team: </span>
            <strong>{insight.suggestedTeamSize}</strong>
          </div>
          {insight.resourceDelta !== 0 && (
            <div style={{ background: colors.bg, padding: '0.4rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.8rem' }}>
              <span style={{ color: '#64748b' }}>Change: </span>
              <strong style={{ color: insight.resourceDelta > 0 ? '#f59e0b' : '#22c55e' }}>
                {insight.resourceDelta > 0 ? '+' : ''}{insight.resourceDelta} resource(s)
              </strong>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '0.6rem', marginTop: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Confidence</span>
          <CBadge color={getConfidenceColor(insight.confidence)} shape="rounded-pill" style={{ fontSize: '0.65rem' }}>
            {insight.confidence}
          </CBadge>
        </div>
        <div style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: '1.4' }}>
          {insight.supportingEvidence}
        </div>

        {/* CR Link for resource recommendations */}
        {insight.type === 'resource_recommendation' && insight.action && insight.action !== 'maintain' && insight.crLink && (
          <div style={{ marginTop: '0.6rem' }}>
            <CButton
              color={insight.action === 'add' ? 'warning' : 'info'}
              variant="outline"
              size="sm"
              onClick={() => navigate(insight.crLink)}
              style={{ fontSize: '0.78rem', width: '100%' }}
            >
              {insight.action === 'add' ? '\u2b06\ufe0f Submit CR to Add Resources' : '\u2b07\ufe0f Submit CR to Release Resources'}
            </CButton>
          </div>
        )}
      </div>
    </div>
  );
};

const AiInsights = ({ projectId }) => {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!projectId) return;

    let isMounted = true;
    const fetchInsights = async () => {
      try {
        setLoading(true);
        const data = await getProjectInsights(projectId);
        if (isMounted) {
          setInsights(data.insights || []);
          setError(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(true);
          console.error('Failed to load insights', err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchInsights();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="section-container">
        <div className="section-header card-header">
          <strong>
            <span className="me-2">{'\u2728'}</span>
            AI Insights
          </strong>
        </div>
        <div className="section-body text-center py-4">
          <CSpinner size="sm" className="me-2 text-primary" />
          <span className="text-muted">Generating AI Insights...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="section-container">
        <div className="section-header card-header">
          <strong>
            <span className="me-2">{'\u2728'}</span>
            AI Insights
          </strong>
        </div>
        <div className="section-body">
          <CAlert color="danger" className="mb-0 border-0 bg-danger bg-opacity-10 text-danger">
            Unable to load AI insights.
          </CAlert>
        </div>
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <div className="section-container">
        <div className="section-header card-header">
          <strong>
            <span className="me-2">{'\u2728'}</span>
            AI Insights
          </strong>
        </div>
        <div className="section-body">
          <div className="text-muted fst-italic py-4 text-center">
            No AI insights available.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section-container">
      <div className="section-header d-flex justify-content-between align-items-center card-header">
        <strong>
          <span className="me-2">{'\u2728'}</span>
          AI Insights
        </strong>
      </div>
      <div className="section-body p-0">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1rem',
          padding: '1rem',
          background: '#f8fafc',
          borderRadius: '0 0 0.5rem 0.5rem'
        }}>
          {insights.map((insight, index) => (
            <InsightCard key={index} insight={insight} navigate={navigate} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default AiInsights;
