import React, { useEffect, useState } from 'react';
import { CAlert, CBadge, CCard, CCardBody, CCardHeader, CCol, CRow, CSpinner } from '@coreui/react';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { getCrTrends, getMlAccuracy, getProjectRisk } from '../../services/analyticsService';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const healthColors = { GREEN: 'success', AMBER: 'warning', RED: 'danger' };

const AnalyticsOverview = () => {
  const [data, setData] = useState({ accuracy: null, risks: [], crTrends: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([getMlAccuracy(), getProjectRisk(), getCrTrends()])
      .then(([accuracy, risks, crTrends]) => {
        if (active) setData({ accuracy, risks, crTrends });
      })
      .catch((err) => {
        if (active) setError(err.message || 'Failed to load analytics');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <div className="text-center py-5"><CSpinner /></div>;
  if (error) return <CAlert color="danger">{error}</CAlert>;

  const healthCounts = data.risks.reduce((acc, row) => {
    acc[row.health] = (acc[row.health] || 0) + 1;
    return acc;
  }, {});

  const crTrendChart = {
    labels: data.crTrends.map((row) => row.period),
    datasets: [
      { label: 'CRs', data: data.crTrends.map((row) => row.total || 0), backgroundColor: '#2f80ed' },
      { label: 'High Severity', data: data.crTrends.map((row) => row.highSeverity || 0), backgroundColor: '#d64550' },
    ],
  };

  const healthChart = {
    labels: Object.keys(healthCounts),
    datasets: [{ data: Object.values(healthCounts), backgroundColor: ['#2eb85c', '#f9b115', '#e55353'] }],
  };

  return (
    <div className="fade-in">
      <h1 className="page-title mb-4">Analytics Overview</h1>
      <CRow className="mb-4">
        <CCol md={3}><Metric title="Effort Accuracy" value={`${data.accuracy.effortAccuracy}%`} /></CCol>
        <CCol md={3}><Metric title="Staffing Match" value={`${data.accuracy.staffingMatch}%`} /></CCol>
        <CCol md={3}><Metric title="Risk Accuracy" value={`${data.accuracy.riskPredictionAccuracy}%`} /></CCol>
        <CCol md={3}><Metric title="Feedback Rows" value={data.accuracy.feedbackCount} /></CCol>
      </CRow>
      <CRow className="mb-4">
        <CCol lg={8}>
          <CCard><CCardHeader>CR Trends</CCardHeader><CCardBody><Bar data={crTrendChart} /></CCardBody></CCard>
        </CCol>
        <CCol lg={4}>
          <CCard><CCardHeader>Portfolio Health</CCardHeader><CCardBody><Pie data={healthChart} /></CCardBody></CCard>
        </CCol>
      </CRow>
      <CCard>
        <CCardHeader>Project Health Indicators</CCardHeader>
        <CCardBody>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead><tr><th>Project</th><th>Status</th><th>Predicted Risk</th><th>CR Count</th><th>Returns</th><th>Health</th></tr></thead>
              <tbody>
                {data.risks.map((row) => (
                  <tr key={row.projectId}>
                    <td>{row.projectName || `Project ${row.projectId}`}</td>
                    <td>{row.status}</td>
                    <td>{row.predictedRisk || '-'}</td>
                    <td>{row.crCount}</td>
                    <td>{row.returnCount}</td>
                    <td><CBadge color={healthColors[row.health] || 'secondary'}>{row.health}</CBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CCardBody>
      </CCard>
    </div>
  );
};

const Metric = ({ title, value }) => (
  <CCard className="h-100">
    <CCardBody>
      <div className="text-muted small">{title}</div>
      <div className="fs-3 fw-semibold">{value}</div>
    </CCardBody>
  </CCard>
);

export default AnalyticsOverview;
