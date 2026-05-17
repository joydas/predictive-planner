import React, { useEffect, useMemo, useState } from 'react';
import { CAlert, CBadge, CCard, CCardBody, CCardHeader, CCol, CRow } from '@coreui/react';
import { Bar } from 'react-chartjs-2';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import DataTable from '../../components/dataTable/DataTable';
import TableToolbar from '../../components/dataTable/TableToolbar';
import { getVarianceDashboard } from '../../services/analyticsService';
import authService from '../../services/authService';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const severityColors = {
  NORMAL: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
  URGENT: 'dark',
};

const AnalyticsOverview = () => {
  const role = String(authService.getUserRole() || '').toUpperCase();
  const [dashboard, setDashboard] = useState(null);
  const [rows, setRows] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, totalRecords: 0, totalPages: 1 });
  const [sort, setSort] = useState({ sortBy: 'approvedAt', sortOrder: 'DESC' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPagination((current) => ({ ...current, page: 1 }));
      setSearch(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getVarianceDashboard({
      page: pagination.page,
      pageSize: pagination.pageSize,
      search,
      ...sort,
    })
      .then((result) => {
        if (!active) return;
        setDashboard(result);
        setRows(result.table?.items || []);
        setPagination({
          page: result.table?.page || 1,
          pageSize: result.table?.pageSize || 10,
          totalRecords: result.table?.totalRecords || 0,
          totalPages: result.table?.totalPages || 1,
        });
        setError('');
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
  }, [pagination.page, pagination.pageSize, search, sort]);

  const columns = useMemo(() => [
    { key: 'projectName', label: 'Project Name', sortKey: 'projectName' },
    { key: 'client', label: 'Client', sortKey: 'client' },
    { key: 'technology', label: 'Technology', sortKey: 'technology' },
    { key: 'pmName', label: 'PM Name', sortKey: 'pmName' },
    { key: 'accountManagerName', label: 'Account Manager Name', sortKey: 'accountManagerName' },
    { key: 'aiBaselineEffort', label: 'AI Baseline Effort', sortKey: 'aiBaselineEffort', render: numberCell('aiBaselineEffort') },
    { key: 'pmBaselineEffort', label: 'PM Baseline Effort', sortKey: 'pmBaselineEffort', render: numberCell('pmBaselineEffort') },
    { key: 'currentPlannedEffort', label: 'Current Planned Effort', sortKey: 'currentPlannedEffort', render: numberCell('currentPlannedEffort') },
    { key: 'actualEffort', label: 'Actual Effort', sortKey: 'actualEffort', render: numberCell('actualEffort') },
    { key: 'aiBaselineBudget', label: 'AI Baseline Budget', sortKey: 'aiBaselineBudget', render: currencyCell('aiBaselineBudget') },
    { key: 'pmBaselineBudget', label: 'PM Baseline Budget', sortKey: 'pmBaselineBudget', render: currencyCell('pmBaselineBudget') },
    { key: 'currentPlannedBudget', label: 'Current Planned Budget', sortKey: 'currentPlannedBudget', render: currencyCell('currentPlannedBudget') },
    { key: 'actualBudget', label: 'Actual Budget', sortKey: 'actualBudget', render: currencyCell('actualBudget') },
    { key: 'aiBaselineTeamSize', label: 'AI Baseline Team Size', sortKey: 'aiBaselineTeamSize', render: numberCell('aiBaselineTeamSize') },
    { key: 'pmBaselineTeamSize', label: 'PM Baseline Team Size', sortKey: 'pmBaselineTeamSize', render: numberCell('pmBaselineTeamSize') },
    { key: 'currentPlannedTeamSize', label: 'Current Planned Team Size', sortKey: 'currentPlannedTeamSize', render: numberCell('currentPlannedTeamSize') },
    { key: 'actualTeamSize', label: 'Actual Team Size', sortKey: 'actualTeamSize', render: numberCell('actualTeamSize') },
    { key: 'effortVariancePercent', label: 'Effort Variance %', render: percentCell('effortVariancePercent') },
    { key: 'budgetVariancePercent', label: 'Budget Variance %', render: percentCell('budgetVariancePercent') },
    { key: 'teamSizeVariancePercent', label: 'Team Size Variance %', render: percentCell('teamSizeVariancePercent') },
    {
      key: 'varianceSeverity',
      label: 'Severity',
      render: (row) => (
        <CBadge color={severityColors[row.varianceSeverity] || 'secondary'}>
          {row.varianceSeverity || 'NORMAL'}
        </CBadge>
      ),
    },
  ], []);

  const handleSort = (sortBy) => {
    setPagination((current) => ({ ...current, page: 1 }));
    setSort((current) => ({
      sortBy,
      sortOrder: current.sortBy === sortBy && current.sortOrder === 'ASC' ? 'DESC' : 'ASC',
    }));
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setPagination((current) => ({ ...current, page: 1 }));
  };

  const widgets = dashboard?.widgets || {};
  const roleLabel = role === 'ACCOUNT_MANAGER' ? 'Account Manager' : role || 'Analytics';

  return (
    <div className="fade-in analytics-dashboard">
      <CRow className="mb-4">
        <CCol xs={12}>
          <h1 className="page-title mb-1">Project Variance Analytics</h1>
          <p className="text-muted mb-0">{roleLabel} view across approved projects</p>
        </CCol>
      </CRow>

      {error && <CAlert color="danger">{error}</CAlert>}

      <CRow className="mb-4">
        <CCol xs={12} xl={6} xxl={3}>
          <ChartCard title="Effort Variance" data={varianceChart(widgets.effortVariance, '#2f80ed')} loading={loading} />
        </CCol>
        <CCol xs={12} xl={6} xxl={3}>
          <ChartCard title="Cost Variance" data={varianceChart(widgets.costVariance, '#d64550')} loading={loading} />
        </CCol>
        <CCol xs={12} xl={6} xxl={3}>
          <ChartCard title="Team Size Variance" data={varianceChart(widgets.teamSizeVariance, '#f9b115')} loading={loading} />
        </CCol>
        <CCol xs={12} xl={6} xxl={3}>
          <ChartCard title="AI vs Actual" data={comparisonChart(widgets.aiVsActual)} options={comparisonOptions} loading={loading} />
        </CCol>
      </CRow>

      <h2 className="h5 mb-3">Project Analytics</h2>
      <TableToolbar
        search={searchInput}
        searchPlaceholder="Search project, client, technology, PM, or AM"
        onSearchChange={setSearchInput}
        onReset={resetFilters}
      />
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error=""
        sortBy={sort.sortBy}
        sortOrder={sort.sortOrder}
        onSort={handleSort}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalRecords={pagination.totalRecords}
        totalPages={pagination.totalPages}
        onPageChange={(page) => setPagination((current) => ({ ...current, page }))}
        onPageSizeChange={(pageSize) => setPagination((current) => ({ ...current, page: 1, pageSize }))}
        emptyMessage="No approved published projects are available for your role."
        noResultsMessage="No approved projects match the current search."
        hasActiveFilters={Boolean(search)}
      />
    </div>
  );
};

const ChartCard = ({ title, data, options = chartOptions, loading }) => (
  <CCard className="h-100 analytics-chart-card">
    <CCardHeader>{title}</CCardHeader>
    <CCardBody>
      {loading ? (
        <div className="analytics-chart-placeholder text-muted">Loading...</div>
      ) : (
        <div className="analytics-chart-frame">
          <Bar data={data} options={options} />
        </div>
      )}
    </CCardBody>
  </CCard>
);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' },
  },
  scales: {
    y: {
      ticks: {
        callback: (value) => `${value}%`,
      },
    },
  },
};

const comparisonOptions = {
  ...chartOptions,
  scales: {
    y: {
      ticks: {
        callback: (value) => compactNumber(value),
      },
    },
  },
};

function varianceChart(widget = {}, color) {
  return {
    labels: widget.labels || [],
    datasets: (widget.datasets || []).map((dataset) => ({
      ...dataset,
      backgroundColor: color,
      borderColor: color,
      borderWidth: 1,
    })),
  };
}

function comparisonChart(widget = {}) {
  return {
    labels: widget.labels || [],
    datasets: (widget.datasets || []).map((dataset, index) => ({
      ...dataset,
      backgroundColor: index === 0 ? '#2f80ed' : '#2eb85c',
      borderColor: index === 0 ? '#2f80ed' : '#2eb85c',
      borderWidth: 1,
    })),
  };
}

function numberCell(key) {
  return (row) => <span className="text-nowrap">{formatNumber(row[key])}</span>;
}

function currencyCell(key) {
  return (row) => <span className="text-nowrap">{formatNumber(row[key])}</span>;
}

function percentCell(key) {
  return (row) => <span className="text-nowrap">{formatPercent(row[key])}</span>;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(2)}%`;
}

function compactNumber(value) {
  return Number(value || 0).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
}

export default AnalyticsOverview;
