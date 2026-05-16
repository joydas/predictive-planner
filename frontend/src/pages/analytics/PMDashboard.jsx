import React, { useEffect, useState } from 'react';
import { CAlert, CCard, CCardBody, CCardHeader, CCol, CRow, CSpinner } from '@coreui/react';
import { Bar } from 'react-chartjs-2';
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js';
import { getPmSummary } from '../../services/analyticsService';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const PMDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getPmSummary().then(setSummary).catch((err) => setError(err.message));
  }, []);

  if (error) return <CAlert color="danger">{error}</CAlert>;
  if (!summary) return <div className="text-center py-5"><CSpinner /></div>;

  const chartData = {
    labels: summary.crTrends.map((row) => row.period),
    datasets: [{ label: 'CR Count', data: summary.crTrends.map((row) => row.count), backgroundColor: '#2f80ed' }],
  };

  return (
    <div className="fade-in">
      <h1 className="page-title mb-4">PM Analytics</h1>
      <CRow className="mb-4">
        <CCol md={3}><Metric title="Active Projects" value={summary.activeProjects} /></CCol>
        <CCol md={3}><Metric title="Returned Projects" value={summary.returnedProjects} /></CCol>
        <CCol md={3}><Metric title="ML Uses" value={summary.mlRecommendationUsage} /></CCol>
        <CCol md={3}><Metric title="Staffing Overrides" value={summary.staffingOverrideCount} /></CCol>
      </CRow>
      <CCard><CCardHeader>CR Trends</CCardHeader><CCardBody><Bar data={chartData} /></CCardBody></CCard>
    </div>
  );
};

const Metric = ({ title, value }) => (
  <CCard><CCardBody><div className="text-muted small">{title}</div><div className="fs-3 fw-semibold">{value}</div></CCardBody></CCard>
);

export default PMDashboard;
