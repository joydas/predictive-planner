import React, { useEffect, useState } from 'react';
import { CAlert, CCard, CCardBody, CCardHeader, CCol, CRow, CSpinner } from '@coreui/react';
import { Bar } from 'react-chartjs-2';
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js';
import { getAmSummary } from '../../services/analyticsService';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const AMDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAmSummary().then(setSummary).catch((err) => setError(err.message));
  }, []);

  if (error) return <CAlert color="danger">{error}</CAlert>;
  if (!summary) return <div className="text-center py-5"><CSpinner /></div>;

  const chartData = {
    labels: summary.mostReturnedProjects.map((row) => `Project ${row.projectId}`),
    datasets: [{ label: 'Returns', data: summary.mostReturnedProjects.map((row) => row.returnCount), backgroundColor: '#f9b115' }],
  };

  return (
    <div className="fade-in">
      <h1 className="page-title mb-4">Account Manager Analytics</h1>
      <CRow className="mb-4">
        <CCol md={4}><Metric title="Pending Approvals" value={summary.pendingApprovals} /></CCol>
        <CCol md={4}><Metric title="High-Risk Projects" value={summary.highRiskProjects} /></CCol>
        <CCol md={4}><Metric title="Approval Turnaround" value={`${summary.approvalTurnaroundHours.toFixed(1)}h`} /></CCol>
      </CRow>
      <CCard><CCardHeader>Most Returned Projects</CCardHeader><CCardBody><Bar data={chartData} /></CCardBody></CCard>
    </div>
  );
};

const Metric = ({ title, value }) => (
  <CCard><CCardBody><div className="text-muted small">{title}</div><div className="fs-3 fw-semibold">{value}</div></CCardBody></CCard>
);

export default AMDashboard;
