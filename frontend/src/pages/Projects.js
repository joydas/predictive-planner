import React, { useState, useEffect } from 'react';
import { CCard, CCardBody, CCardHeader, CCol, CRow, CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CButton, CSpinner, CAlert, CFormInput, CBadge, CTooltip } from '@coreui/react';
import { useNavigate } from 'react-router-dom';
import { NODE_API_URL } from '../config';
import { calculateVariance, getRiskLevel, getRiskColor, formatVariance } from '../utils/projectUtils';
import CIcon from '@coreui/icons-react';
import { cilChart, cilReload, cilPeople, cilPlus } from '@coreui/icons';

const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${NODE_API_URL}/projects`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setProjects(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError('Failed to load projects. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleProgress = (projectId) => {
    navigate(`/progress/${projectId}`);
  };

  const handleChangeRequest = (projectId) => {
    navigate(`/change-request/${projectId}`);
  };

  const handleTeamRecommendation = (projectId) => {
    navigate(`/team-recommendation/${projectId}`);
  };

  const excludedColumns = ['created_by', 'id', 'start_date', 'end_date', 'actual_hours','variance'];
  const displayedColumns = projects.length
    ? Object.keys(projects[0]).filter((key) => !excludedColumns.includes(key))
    : [];

  // Add risk calculation to projects
  const projectsWithRisk = projects.map(project => {
    const variance = calculateVariance(project.predicted_hours || 0, project.estimated_hours || 0);
    const riskLevel = getRiskLevel(variance);
    return { ...project, variance, riskLevel };
  });

  const formatHeader = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredProjects = projectsWithRisk.filter((project) =>
    displayedColumns.some((column) => {
      const value = project[column];
      return String(value).toLowerCase().includes(normalizedSearch);
    }),
  );

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const currentData = filteredProjects.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <div className="fade-in">
        <CRow className="mb-4">
          <CCol xs={12}>
            <h1 className="page-title">
              Projects Management
            </h1>
          </CCol>
        </CRow>
        <CRow>
          <CCol xs={12} className="text-center">
            <CCard>
              <CCardBody className="py-5">
                <CSpinner color="primary" size="lg" />
                <p className="mt-3 text-muted">Loading projects...</p>
              </CCardBody>
            </CCard>
          </CCol>
        </CRow>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fade-in">
        <CRow className="mb-4">
          <CCol xs={12}>
            <h1 className="page-title">
              Projects Management
            </h1>
          </CCol>
        </CRow>
        <CRow>
          <CCol xs={12}>
            <CAlert color="danger">
              <strong>Error:</strong> {error}
              <CButton
                color="primary"
                size="sm"
                className="ms-3"
                onClick={fetchProjects}
              >
                Retry
              </CButton>
            </CAlert>
          </CCol>
        </CRow>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <h1 className="page-title">
                Projects Management
              </h1>
              <p className="text-muted mb-0">{filteredProjects.length} project(s) available</p>
            </div>
            <div className="d-flex flex-column flex-md-row gap-3 align-items-start align-items-md-center">
              <CFormInput
                type="search"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="smaller-button"
              />
              <CTooltip content="Create Project">
                <CButton
                  color="primary"
                  variant="outline"
                  size="sm"
                  className="action-btn"
                  onClick={() => navigate('/create-project')}
                >
                  <CIcon icon={cilPlus} size="sm" />
                </CButton>
              </CTooltip>
            </div>
          </div>
        </CCol>
      </CRow>

      <CRow>
        <CCol xs={12}>
          <CCard>
            <CCardHeader>
              <strong>All Projects ({filteredProjects.length})</strong>
            </CCardHeader>
            <CCardBody className="p-0">
              {filteredProjects.length === 0 ? (
                <div className="text-center py-5">
                  <div className="text-muted" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
                  <h5>No matching projects found</h5>
                  <p className="text-muted">Adjust your search or add a new project.</p>
                  <CButton
                    color="primary"
                    onClick={() => navigate('/create-project')}
                  >
                    Create Project
                  </CButton>
                </div>
              ) : (
                <>
                  <div className="table-responsive">
                    <CTable hover className="table-sm mb-0">
                      <CTableHead>
                        <CTableRow>
                          {displayedColumns.map((column) => (
                            <CTableHeaderCell key={column}>{formatHeader(column)}</CTableHeaderCell>
                          ))}
                          <CTableHeaderCell>Variance</CTableHeaderCell>
                          <CTableHeaderCell>Risk Level</CTableHeaderCell>
                          <CTableHeaderCell className="text-center">Actions</CTableHeaderCell>
                        </CTableRow>
                      </CTableHead>
                      <CTableBody>
                        {currentData.map((project) => (
                          <CTableRow key={project.id}>
                            {displayedColumns.map((column) => (
                              <CTableDataCell key={`${project.id}-${column}`}>
                                {project[column] === null || project[column] === undefined
                                  ? '—'
                                  : typeof project[column] === 'object'
                                  ? JSON.stringify(project[column])
                                  : column === 'predicted_hours' || column === 'estimated_hours'
                                  ? `${project[column]}h`
                                  : project[column]}
                              </CTableDataCell>
                            ))}
                            <CTableDataCell>
                              <span className={`fw-bold ${project.variance >= 0 ? 'text-danger' : 'text-success'}`}>
                                {formatVariance(project.variance)}
                              </span>
                            </CTableDataCell>
                            <CTableDataCell>
                              <CBadge color={getRiskColor(project.riskLevel)}>
                                {project.riskLevel}
                              </CBadge>
                            </CTableDataCell>
                            <CTableDataCell>
                              <div className="d-flex gap-1 justify-content-center action-buttons">
                                <CTooltip content="Progress">
                                  <CButton
                                    color="info"
                                    variant="outline"
                                    size="sm"
                                    className="action-btn"
                                    onClick={() => handleProgress(project.id)}
                                  >
                                    <CIcon icon={cilChart} size="sm" />
                                  </CButton>
                                </CTooltip>
                                <CTooltip content="Change Request">
                                  <CButton
                                    color="warning"
                                    variant="outline"
                                    size="sm"
                                    className="action-btn"
                                    onClick={() => handleChangeRequest(project.id)}
                                  >
                                    <CIcon icon={cilReload} size="sm" />
                                  </CButton>
                                </CTooltip>
                                <CTooltip content="Team">
                                  <CButton
                                    color="success"
                                    variant="outline"
                                    size="sm"
                                    className="action-btn"
                                    onClick={() => handleTeamRecommendation(project.id)}
                                  >
                                    <CIcon icon={cilPeople} size="sm" />
                                  </CButton>
                                </CTooltip>
                              </div>
                            </CTableDataCell>
                          </CTableRow>
                        ))}
                      </CTableBody>
                    </CTable>
                  </div>

                  <div className="d-flex justify-content-between align-items-center p-3 gap-3 flex-column flex-md-row">
                    <div className="text-muted">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="d-flex gap-2">
                      <CButton
                        color="secondary"
                        size="sm"
                        className="smaller-button"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={currentPage === 1}
                      >
                        &lt;
                      </CButton>
                      <CButton
                        color="secondary"
                        size="sm"
                        className="smaller-button"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={currentPage === totalPages}
                      >
                        &gt;
                      </CButton>
                    </div>
                  </div>
                </>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
};

export default Projects;