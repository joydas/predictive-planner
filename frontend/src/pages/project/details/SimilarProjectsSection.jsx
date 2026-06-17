import React, { useState } from 'react';
import { CBadge, CTable, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow, CTooltip } from '@coreui/react';
import { formatCurrency } from '../../../utils/resourcePlanning';

const SimilarProjectsSection = ({ projects }) => {
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="section-container">
      <div className="section-header">
        <div className="d-flex align-items-center gap-2">
          <h4>Similar Historical Projects</h4>
          <CTooltip content="Similarity is determined using industry, technology, complexity, effort, budget, team size, duration, and CR history.">
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
                <CTableHeaderCell>Technology</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Duration (Days)</CTableHeaderCell>
                <CTableHeaderCell>Outcome</CTableHeaderCell>
                <CTableHeaderCell></CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {projects?.length > 0 ? (
                projects.map((project) => (
                  <React.Fragment key={project.projectId}>
                    <CTableRow 
                      className="similarity-row"
                      onClick={() => setExpandedId(expandedId === project.projectId ? null : project.projectId)}
                    >
                      <CTableDataCell>
                        <CBadge color="info" className="match-badge">
                          {Math.round(project.similarity)}% Match
                        </CBadge>
                      </CTableDataCell>
                      <CTableDataCell className="fw-semibold">
                        {project.projectName || `Project ${project.projectId}`}
                      </CTableDataCell>
                      <CTableDataCell>{project.technology}</CTableDataCell>
                      <CTableDataCell className="text-end">{project.actualDurationDays}</CTableDataCell>
                      <CTableDataCell>
                        <CBadge color={project.completedOnTime ? 'success' : 'warning'}>
                          {project.completedOnTime ? 'On Time' : 'Delayed'}
                        </CBadge>
                      </CTableDataCell>
                      <CTableDataCell className="text-center text-muted">
                        {expandedId === project.projectId ? '▲' : '▼'}
                      </CTableDataCell>
                    </CTableRow>
                    {expandedId === project.projectId && (
                      <CTableRow>
                        <CTableDataCell colSpan={6} className="p-0">
                          <div className="similarity-details">
                            <div className="row g-3">
                              <div className="col-md-3">
                                <div className="text-muted small">Actual Effort</div>
                                <div>{project.actualEffort} PD</div>
                              </div>
                              <div className="col-md-3">
                                <div className="text-muted small">Actual Budget</div>
                                <div>{formatCurrency(project.actualBudget)}</div>
                              </div>
                              <div className="col-md-3">
                                <div className="text-muted small">Industry</div>
                                <div>{project.industry}</div>
                              </div>
                              <div className="col-md-3">
                                <div className="text-muted small">Approved CRs</div>
                                <div>{project.approvedCrCount}</div>
                              </div>
                            </div>
                          </div>
                        </CTableDataCell>
                      </CTableRow>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <CTableRow>
                  <CTableDataCell colSpan={6} className="text-center text-muted py-3">
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
