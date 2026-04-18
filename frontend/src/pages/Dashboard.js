import React, { useEffect, useState } from 'react';
import { CCard, CCardBody, CCardHeader, CCol, CRow, CSpinner, CAlert, CWidgetStatsF, CBadge } from '@coreui/react';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { NODE_API_URL } from '../config';
import { calculateVariance, getRiskLevel, getRiskColor, formatVariance } from '../utils/projectUtils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const Dashboard = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      setError('Failed to load dashboard data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics
  const totalProjects = projects.length;

  // Calculate risk levels for all projects
  const projectsWithRisk = projects.map(project => {
    const variance = calculateVariance(project.predicted_hours || 0, project.estimated_hours || 0);
    const riskLevel = getRiskLevel(variance);
    return { ...project, variance, riskLevel };
  });

  // Count projects by risk level
  const riskCounts = {
    Low: projectsWithRisk.filter(p => p.riskLevel === 'Low').length,
    Medium: projectsWithRisk.filter(p => p.riskLevel === 'Medium').length,
    High: projectsWithRisk.filter(p => p.riskLevel === 'High').length,
    Critical: projectsWithRisk.filter(p => p.riskLevel === 'Critical').length,
  };

  const highRiskProjects = projectsWithRisk.filter(p => ['High', 'Critical'].includes(p.riskLevel));

  // Calculate average variance
  const avgVariance = projectsWithRisk.length > 0
    ? projectsWithRisk.reduce((sum, p) => sum + Math.abs(p.variance), 0) / projectsWithRisk.length
    : 0;

  // Dummy resource utilization (can be replaced with real data later)
  const resourceUtilization = 78; // percentage

  // Trend indicators (dummy values for now - can be calculated from historical data)
  const trends = {
    totalProjects: 12, // +12% from last month
    avgVariance: -5,   // -5% improvement
    highRisk: -8,      // -8% reduction
    utilization: 3     // +3% increase
  };

  // Bar chart data: Estimated vs Predicted Hours
  const barChartData = {
    labels: projects.slice(0, 10).map((p) => p.name || 'Project'),
    datasets: [
      {
        label: 'Estimated Hours',
        data: projects.slice(0, 10).map((p) => p.estimated_hours || 0),
        backgroundColor: 'rgba(21, 108, 194, 0.7)',
        borderColor: 'rgba(44, 62, 80, 1)',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Predicted Hours',
        data: projects.slice(0, 10).map((p) => p.predicted_hours || 0),
        backgroundColor: 'rgba(27, 191, 62, 0.7)',
        borderColor: 'rgba(127, 140, 141, 1)',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  // Pie chart data: Business Unit distribution
  const businessUnits = {};
  projects.forEach((p) => {
    const unit = p.business_unit || 'Unknown';
    businessUnits[unit] = (businessUnits[unit] || 0) + 1;
  });

  const pieChartData = {
    labels: Object.keys(businessUnits),
    datasets: [
      {
        data: Object.values(businessUnits),
        backgroundColor: [
          '#82cda2',
          '#34495e',
          '#7f8c8d',
          '#95a5a6',
          '#bdc3c7',
          '#ecf0f1',
        ],
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          font: { size: 12 },
          padding: 15,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 14 },
        bodyFont: { size: 12 },
      },
    },
  };

  const barChartOptions = {
    ...chartOptions,
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  if (loading) {
    return (
      <div className="fade-in">
        <CRow className="mb-4">
          <CCol xs={12}>
            <h1 className="mb-4 page-title" style={{
              background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontWeight: '700'
            }}>
              Dashboard Overview
            </h1>
          </CCol>
        </CRow>
        <CRow>
          <CCol xs={12} className="text-center">
            <CCard>
              <CCardBody className="py-5">
                <CSpinner color="primary" size="lg" />
                <p className="mt-3 text-muted">Loading dashboard data...</p>
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
            <h1 className="mb-4 page-title" style={{
              background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontWeight: '700'
            }}>
              Dashboard Overview
            </h1>
          </CCol>
        </CRow>
        <CRow>
          <CCol xs={12}>
            <CAlert color="danger">
              <strong>Error:</strong> {error}
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
          <h1 className="mb-4 page-title" style={{
            background: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontWeight: '700'
          }}>
            Dashboard Overview
          </h1>
        </CCol>
      </CRow>

      {/* KPI Cards */}
      <CRow className="mb-4 section-gap">
        <CCol md={3} className="mb-3">
          <CCard className="border-0 shadow-sm h-100 kpi-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <CCardBody className="p-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <div className="card-title">TOTAL PROJECTS</div>
                  <div className="card-value">{totalProjects}</div>
                </div>
                <div style={{ fontSize: '1.5rem', opacity: 0.8 }}>📊</div>
              </div>
              <div className="d-flex align-items-center">
                <span className={`badge ${trends.totalProjects >= 0 ? 'bg-success' : 'bg-danger'} me-2`} style={{ fontSize: '0.7rem' }}>
                  {trends.totalProjects >= 0 ? '↗' : '↘'} {Math.abs(trends.totalProjects)}%
                </span>
                <small className="opacity-75" style={{ fontSize: '0.7rem' }}>vs last month</small>
              </div>
            </CCardBody>
          </CCard>
        </CCol>

        <CCol md={3} className="mb-3">
          <CCard className="border-0 shadow-sm h-100 kpi-card" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
            <CCardBody className="p-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <div className="card-title">AVG VARIANCE</div>
                  <div className="card-value">{avgVariance.toFixed(1)}%</div>
                </div>
                <div style={{ fontSize: '1.5rem', opacity: 0.8 }}>📈</div>
              </div>
              <div className="d-flex align-items-center">
                <span className={`badge ${trends.avgVariance >= 0 ? 'bg-danger' : 'bg-success'} me-2`} style={{ fontSize: '0.7rem' }}>
                  {trends.avgVariance >= 0 ? '↗' : '↘'} {Math.abs(trends.avgVariance)}%
                </span>
                <small className="opacity-75" style={{ fontSize: '0.7rem' }}>improvement</small>
              </div>
            </CCardBody>
          </CCard>
        </CCol>

        <CCol md={3} className="mb-3">
          <CCard className="border-0 shadow-sm h-100 kpi-card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
            <CCardBody className="p-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <div className="card-title">HIGH RISK COUNT</div>
                  <div className="card-value">{highRiskProjects.length}</div>
                </div>
                <div style={{ fontSize: '1.5rem', opacity: 0.8 }}>🚨</div>
              </div>
              <div className="d-flex align-items-center">
                <span className={`badge ${trends.highRisk >= 0 ? 'bg-danger' : 'bg-success'} me-2`} style={{ fontSize: '0.7rem' }}>
                  {trends.highRisk >= 0 ? '↗' : '↘'} {Math.abs(trends.highRisk)}%
                </span>
                <small className="opacity-75" style={{ fontSize: '0.7rem' }}>reduction</small>
              </div>
            </CCardBody>
          </CCard>
        </CCol>

        <CCol md={3} className="mb-3">
          <CCard className="border-0 shadow-sm h-100 kpi-card" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color: 'white' }}>
            <CCardBody className="p-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <div className="card-title">RESOURCE UTILIZATION</div>
                  <div className="card-value">{resourceUtilization}%</div>
                </div>
                <div style={{ fontSize: '1.5rem', opacity: 0.8 }}>👥</div>
              </div>
              <div className="d-flex align-items-center">
                <span className={`badge ${trends.utilization >= 0 ? 'bg-success' : 'bg-danger'} me-2`} style={{ fontSize: '0.7rem' }}>
                  {trends.utilization >= 0 ? '↗' : '↘'} {Math.abs(trends.utilization)}%
                </span>
                <small className="opacity-75" style={{ fontSize: '0.7rem' }}>vs last month</small>
              </div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      {/* Charts */}
      <CRow className="mb-4 section-gap">
        <CCol lg={6} className="mb-4">
          <CCard className="border-0 shadow-sm">
            <CCardHeader className="border-bottom">
              <strong>Estimated vs Predicted Hours (Top 10 Projects)</strong>
            </CCardHeader>
            <CCardBody>
              {projects.length > 0 ? (
                <div style={{ height: '350px' }}>
                  <Bar data={barChartData} options={barChartOptions} />
                </div>
              ) : (
                <p className="text-muted text-center py-5">No projects to display</p>
              )}
            </CCardBody>
          </CCard>
        </CCol>

        <CCol lg={6} className="mb-4">
          <CCard className="border-0 shadow-sm">
            <CCardHeader className="border-bottom">
              <strong>Business Unit Distribution</strong>
            </CCardHeader>
            <CCardBody>
              {Object.keys(businessUnits).length > 0 ? (
                <div style={{ height: '350px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ width: '80%', height: '100%' }}>
                    <Pie data={pieChartData} options={chartOptions} />
                  </div>
                </div>
              ) : (
                <p className="text-muted text-center py-5">No projects to display</p>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      {/* High Risk Projects Details */}
      {highRiskProjects.length > 0 && (
        <CRow className="section-gap">
          <CCol xs={12}>
            <CCard className="border-0 shadow-sm">
              <CCardHeader className="border-bottom">
                <strong>High Risk Projects ({highRiskProjects.length})</strong>
              </CCardHeader>
              <CCardBody>
                <div className="table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead className="bg-light">
                      <tr>
                        <th>Project Name</th>
                        <th>Business Unit</th>
                        <th className="text-end">Estimated (h)</th>
                        <th className="text-end">Predicted (h)</th>
                        <th className="text-end">Variance</th>
                        <th>Risk Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {highRiskProjects.map((project) => (
                        <tr key={project.id}>
                          <td>
                            <strong>{project.name}</strong>
                          </td>
                          <td>{project.business_unit}</td>
                          <td className="text-end number-cell">{project.estimated_hours}h</td>
                          <td className="text-end number-cell">{project.predicted_hours}h</td>
                          <td className="text-end">
                            <span className={`fw-bold ${project.variance >= 0 ? 'text-danger' : 'text-success'}`}>
                              {formatVariance(project.variance)}
                            </span>
                          </td>
                          <td>
                            <CBadge color={getRiskColor(project.riskLevel)}>
                              {project.riskLevel}
                            </CBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CCardBody>
            </CCard>
          </CCol>
        </CRow>
      )}

      

      <CRow className="section-gap">
        <CCol md={8}>
          <CCard>
            <CCardHeader>
              <strong>Recent Activity</strong>
            </CCardHeader>
            <CCardBody>
              <div className="text-center py-5">
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📈</div>
                <h5>Analytics Dashboard</h5>
                <p className="text-muted">Charts and analytics will be displayed here</p>
              </div>
            </CCardBody>
          </CCard>
        </CCol>
        <CCol md={4}>
          <CCard>
            <CCardHeader>
              <strong>Quick Actions</strong>
            </CCardHeader>
            <CCardBody>
              <div className="d-grid gap-3">
                <button className="btn btn-primary smaller-button">
                  <span style={{ marginRight: '0.5rem' }}>➕</span>
                  Create New Project
                </button>
                <button className="btn btn-success smaller-button">
                  <span style={{ marginRight: '0.5rem' }}>👥</span>
                  View Team
                </button>
                <button className="btn btn-warning smaller-button">
                  <span style={{ marginRight: '0.5rem' }}>📋</span>
                  Generate Report
                </button>
                <button className="btn btn-secondary smaller-button">
                  <span style={{ marginRight: '0.5rem' }}>⚙️</span>
                  Settings
                </button>
              </div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
};

export default Dashboard;