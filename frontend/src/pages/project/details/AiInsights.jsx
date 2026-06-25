import React, { useState, useEffect } from 'react';
import { CAlert, CBadge, CSpinner } from '@coreui/react';
import { getProjectInsights } from '../../../services/projectService';

const InsightPanel = ({ title, icon, children }) => (
  <div className="insight-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--cui-body-bg)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--cui-border-color)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
    <div className="insight-panel-header" style={{ borderBottom: '1px solid var(--cui-border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
      {icon && <span className="me-2" style={{ fontSize: '1.2rem' }}>{icon}</span>}
      <strong style={{ fontSize: '1rem', color: 'var(--cui-body-color)' }}>{title}</strong>
    </div>
    <div className="insight-panel-body" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {children}
    </div>
  </div>
);

const getIconForInsight = (title) => {
  if (!title) return '💡';
  const t = title.toLowerCase();
  if (t.includes('resource') || t.includes('team')) return '👥';
  if (t.includes('forecast') || t.includes('time') || t.includes('delay')) return '📈';
  if (t.includes('similar') || t.includes('history')) return '🔍';
  if (t.includes('risk')) return '⚠️';
  return '💡';
};

const getConfidenceColor = (confidence) => {
  if (!confidence) return 'secondary';
  const c = String(confidence).toLowerCase();
  if (c === 'high') return 'success';
  if (c === 'medium') return 'warning';
  if (c === 'low') return 'danger';
  return 'secondary';
};

const AiInsights = ({ projectId }) => {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
          console.error("Failed to load insights", err);
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
        <div className="section-header">
          <h4 className="mb-0">
            <span className="me-2">✨</span>
            AI Insights
          </h4>
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
        <div className="section-header">
          <h4 className="mb-0">
            <span className="me-2">✨</span>
            AI Insights
          </h4>
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
        <div className="section-header">
          <h4 className="mb-0">
            <span className="me-2">✨</span>
            AI Insights
          </h4>
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
      <div className="section-header d-flex justify-content-between align-items-center">
        <h4 className="mb-0">
          <span className="me-2">✨</span>
          AI Insights
        </h4>
      </div>
      <div className="section-body p-0">
        <div className="insight-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          padding: '1rem',
          background: 'var(--cui-secondary-bg)',
          borderRadius: '0 0 0.5rem 0.5rem'
        }}>
          {insights.map((insight, index) => (
            <InsightPanel key={index} title={insight.title} icon={getIconForInsight(insight.title)}>
              <div className="mb-2" style={{ fontSize: '0.95rem', lineHeight: '1.4', color: 'var(--cui-body-color)' }}>
                {insight.summary}
              </div>
              <div className="mt-auto pt-3" style={{ borderTop: '1px dashed var(--cui-border-color)' }}>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="text-muted small fw-semibold">Confidence</span>
                  <CBadge color={getConfidenceColor(insight.confidence)} shape="rounded-pill">
                    {insight.confidence}
                  </CBadge>
                </div>
                <div className="text-muted" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                  <strong className="d-block mb-1">Supporting Evidence:</strong>
                  {insight.supportingEvidence}
                </div>
              </div>
            </InsightPanel>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AiInsights;
