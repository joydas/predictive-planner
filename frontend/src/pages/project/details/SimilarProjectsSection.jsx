import React, { useState } from 'react';
import { CBadge, CTable, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow, CTooltip } from '@coreui/react';
import { formatCurrency } from '../../../utils/resourcePlanning';

const SimilarProjectsSection = ({ projects }) => {
  const [expandedId, setExpandedId] = useState(null);

  const getVarianceColor = (variance) => {
    if (variance > 0) return 'danger';
    if (variance < 0) return 'success';
    return 'secondary';
  };

  return (
    <div className="section-container">
      <div className="section-header card-header">
        <div className="d-flex align-items-center gap-2">
          <strong>Similar Historical Projects</strong>
          <CTooltip content="Similarity is determined using industry, technology, project type, delivery model, budget, team size, and duration.">
            <span className="text-muted small" style={{ cursor: 'help' }}>ⓘ</span>
          </CTooltip>
        </div>
      </div>
      <div className="section-body p-0">
        <div className="table-responsive">
          <CTable hover small className="mb-0 compact-table">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>Similarity</CTableHeaderCell>
                <CTableHeaderCell>Project Name</CTableHeaderCell>
                <CTableHeaderCell>Matching Factors</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Duration</CTableHeaderCell>
                <CTableHeaderCell>Outcome</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Budget Variance</CTableHeaderCell>
                <CTableHeaderCell></CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {projects?.length > 0 ? (
                projects.map((project) => {
                  const budgetVariance = (project.actualBudget || 0) - (project.budget || 0);
                  return (
                    <React.Fragment key={project.projectId}>
                      <CTableRow 
                        className="similarity-row"
                        onClick={() => setExpandedId(expandedId === project.projectId ? null : project.projectId)}
                        style={{ cursor: 'pointer' }}
                      >
                        <CTableDataCell>
                          <CBadge color="info" className="match-badge">
                            {Math.round(project.similarityScore || project.similarity || 0)}% Match
                          </CBadge>
                        </CTableDataCell>
                        <CTableDataCell className="fw-semibold">
                          {project.projectName || `Project ${project.projectId}`}
                        </CTableDataCell>
                        <CTableDataCell>
                          <div className="d-flex flex-wrap gap-1">
                            {(project.matchingFactors || []).slice(0, 3).map((factor, idx) => (
                              <CBadge key={idx} color="secondary" shape="rounded-pill" className="fw-normal">{factor}</CBadge>
                            ))}
                            {(project.matchingFactors?.length > 3) && (
                              <CBadge color="light" textBgColor="dark" shape="rounded-pill" className="fw-normal">+{project.matchingFactors.length - 3}</CBadge>
                            )}
                          </div>
                        </CTableDataCell>
                        <CTableDataCell className="text-end">{project.actualDurationDays} Days</CTableDataCell>
                        <CTableDataCell>
                          <CBadge color={project.completedOnTime ? 'success' : 'warning'}>
                            {project.status || (project.completedOnTime ? 'On Time' : 'Delayed')}
                          </CBadge>
                        </CTableDataCell>
                        <CTableDataCell className="text-end">
                          <span className={`text-${getVarianceColor(budgetVariance)}`}>
                            {budgetVariance > 0 ? '+' : ''}{formatCurrency(budgetVariance)}
                          </span>
                        </CTableDataCell>
                        <CTableDataCell className="text-center text-muted">
                          {expandedId === project.projectId ? '▲' : '▼'}
                        </CTableDataCell>
                      </CTableRow>
                      {expandedId === project.projectId && (
                        <CTableRow>
                          <CTableDataCell colSpan={7} className="p-0">
                            <div className="similarity-details p-3 bg-light border-bottom">
                              <div className="row g-3">
                                <div className="col-md-3">
                                  <div className="text-muted small">Actual Effort</div>
                                  <div className="fw-semibold">{project.actualEffort} PD</div>
                                </div>
                                <div className="col-md-3">
                                  <div className="text-muted small">Actual Budget</div>
                                  <div className="fw-semibold">{formatCurrency(project.actualBudget)}</div>
                                </div>
                                <div className="col-md-3">
                                  <div className="text-muted small">Industry</div>
                                  <div className="fw-semibold">{project.industry || 'N/A'}</div>
                                </div>
                                <div className="col-md-3">
                                  <div className="text-muted small">Approved CRs</div>
                                  <div className="fw-semibold">{project.approvedCrCount}</div>
                                </div>
                                <div className="col-12 mt-2">
                                  <div className="text-muted small mb-1">All Matching Factors</div>
                                  <div className="d-flex flex-wrap gap-2">
                                    {(project.matchingFactors || []).map((factor, idx) => (
                                      <CBadge key={idx} color="secondary" variant="outline">{factor}</CBadge>
                                    ))}
                                    {!(project.matchingFactors?.length) && <span className="text-muted small italic">None</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CTableDataCell>
                        </CTableRow>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <CTableRow>
                  <CTableDataCell colSpan={7} className="text-center text-muted py-4">
                    No similar historical projects found.
                  </CTableDataCell>
                </CTableRow>
              )}
            </CTableBody>
          </CTable>
        </div>
      </div>
    </div>
  );
};

export default SimilarProjectsSection;
