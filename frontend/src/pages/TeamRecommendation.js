import React, { useCallback, useEffect, useState } from 'react';
import {
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
  CButton,
  CAlert,
  CSpinner,
  CListGroup,
  CListGroupItem,
} from '@coreui/react';
import { useParams, useNavigate } from 'react-router-dom';
import { NODE_API_URL } from '../config';

const TeamRecommendation = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRecommendation = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${NODE_API_URL}/recommend-team/${projectId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load team recommendation');
      }

      setRecommendation(data);
    } catch (err) {
      setError(err.message || 'Unable to fetch recommendation');
      setRecommendation(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      fetchRecommendation();
    }
  }, [projectId, fetchRecommendation]);

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <div className="d-flex align-items-center mb-3 flex-wrap">
            <CButton
              color="secondary"
              variant="outline"
              onClick={() => navigate('/projects')}
              className="me-3 smaller-button mb-2"
            >
              ← Back to Projects
            </CButton>
            <div>
              <h1
                className="page-title"
                style={{
                  background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  fontWeight: '700',
                  margin: 0,
                }}
              >
                Team Recommendation
              </h1>
              <p className="text-muted mb-0">Project ID: {projectId}</p>
            </div>
          </div>
        </CCol>
      </CRow>

      {error && (
        <CRow className="mb-4">
          <CCol xs={12}>
            <CAlert color="danger" dismissible onClose={() => setError('')}>
              <strong>Error:</strong> {error}
            </CAlert>
          </CCol>
        </CRow>
      )}

      <CRow>
        <CCol lg={8} xs={12} className="mb-4">
          <CCard>
            <CCardHeader className="d-flex justify-content-between align-items-center flex-wrap">
              <strong>Recommended Team</strong>
              <CButton color="primary" size="sm" className="smaller-button" onClick={fetchRecommendation} disabled={loading}>
                {loading ? (
                  <>
                    <CSpinner component="span" size="sm" className="me-2" aria-hidden="true" />
                    Refresh
                  </>
                ) : (
                  'Refresh Recommendation'
                )}
              </CButton>
            </CCardHeader>
            <CCardBody>
              {loading && (
                <div className="text-center py-5">
                  <CSpinner />
                  <p className="text-muted mt-3">Loading recommended team...</p>
                </div>
              )}

              {!loading && recommendation && (
                <>
                  <div className="mb-4">
                    <h4 className="mb-2">Recommended Team Size</h4>
                    <div className="p-4 bg-light rounded border">
                      <span style={{ fontSize: '2.5rem', fontWeight: '700', color: '#2c3e50' }}>
                        {recommendation.recommended_team_size ?? '—'}
                      </span>
                      <p className="text-muted mb-0">Team members suggested for this project.</p>
                    </div>
                  </div>

                  <div>
                    <h5 className="mb-3">Recommended Members</h5>
                    {recommendation.team && recommendation.team.length > 0 ? (
                      <CListGroup>
                        {recommendation.team.map((member, index) => (
                          <CListGroupItem key={`${member.name}-${index}`} className="mb-3 p-4 rounded shadow-sm">
                            <div className="d-flex justify-content-between flex-wrap align-items-start">
                              <div>
                                <h6 className="mb-1">{member.name}</h6>
                                <p className="text-muted mb-2">{member.role}</p>
                                <p className="text-muted mb-2">{member.technology}</p>
                              </div>
                              <div className="text-end">
                                <p className="text-muted small mb-1">Experience</p>
                                <strong>{member.experience_years}</strong>
                              </div>
                            </div>
                          </CListGroupItem>
                        ))}
                      </CListGroup>
                    ) : (
                      <p className="text-muted">No team members were returned for this project yet.</p>
                    )}
                  </div>
                </>
              )}

              {!loading && !recommendation && !error && (
                <div className="text-center py-5">
                  <div style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#7f8c8d' }}>👥</div>
                  <h5>No recommendation available yet</h5>
                  <p className="text-muted">Click refresh to request the team recommendation for this project.</p>
                </div>
              )}
            </CCardBody>
          </CCard>
        </CCol>

        <CCol lg={4} xs={12}>
          <CCard className="mb-4">
            <CCardHeader>
              <strong>How this works</strong>
            </CCardHeader>
            <CCardBody>
              <p className="text-muted">
                The system calls the backend recommendation endpoint to suggest the ideal team size and members for your project.
              </p>
              <ul className="text-start small">
                <li>✅ Uses project-specific metrics</li>
                <li>✅ Recommends skill fit and experience</li>
                <li>✅ Updated on demand with refresh</li>
              </ul>
            </CCardBody>
          </CCard>

          <CCard>
            <CCardHeader>
              <strong>Recommendation tips</strong>
            </CCardHeader>
            <CCardBody>
              <div className="d-grid gap-2">
                <div className="p-3 border rounded bg-light">
                  <strong>Team Size</strong>
                  <p className="mb-0 text-muted">Use the recommended size to balance delivery speed and overhead.</p>
                </div>
                <div className="p-3 border rounded bg-light">
                  <strong>Skills</strong>
                  <p className="mb-0 text-muted">Match specialists to the project challenge areas.</p>
                </div>
                <div className="p-3 border rounded bg-light">
                  <strong>Experience</strong>
                  <p className="mb-0 text-muted">Prefer higher experience for critical work streams.</p>
                </div>
              </div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
};

export default TeamRecommendation;
