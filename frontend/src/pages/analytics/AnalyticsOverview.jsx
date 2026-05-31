import React, { useEffect, useMemo, useState } from 'react';
import { CAlert, CBadge, CCard, CCardBody, CCardHeader, CCol, CRow, CTooltip } from '@coreui/react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import DataTable from '../../components/dataTable/DataTable';
import TableToolbar from '../../components/dataTable/TableToolbar';
import SeverityInfoHint from '../../components/SeverityInfoHint';
import { getVarianceDashboard } from '../../services/analyticsService';
import authService from '../../services/authService';
import { parseBackendDate } from '../../utils/dateFormat';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const severityColors = {
  'Not Measured': 'secondary',
  Normal: 'success',
  Medium: 'warning',
  High: 'warning',
  Urgent: 'danger',
};

const aiOutperformedTooltip = {
  text: `Measures how often AI recommendations were closer to actual project outcomes than PM estimates.

Comparisons are performed using:

* Effort
* Budget
* Team Size
* Estimation

across projects with available actual values.

Higher percentages indicate stronger AI prediction performance.`,
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
    { key: 'pmName', label: 'PM Name', sortKey: 'pmName' },
    {
      key: 'severity',
      label: (
        <>
          Severity
          <SeverityInfoHint />
        </>
      ),
      render: (row) => (
        <CBadge color={severityColors[row.severity] || 'secondary'} className={row.severity === 'High' ? 'severity-badge-high' : ''}>
          {row.severity || 'Not Measured'}
        </CBadge>
      ),
    },
    { key: 'progressPercent', className: 'text-end', label: 'Progress %', sortKey: 'progressPercent', render: compactPercentCell('progressPercent') },
    { key: 'currentPlannedEffort', className: 'text-end', label: 'Planned Effort (PD)', sortKey: 'currentPlannedEffort', render: numberCell('currentPlannedEffort') },
    { key: 'actualEffort', className: 'text-end', label: 'Actual Effort (PD)', sortKey: 'actualEffort', render: numberCell('actualEffort') },
    { key: 'currentPlannedBudget', className: 'text-end', label: 'Planned Budget', sortKey: 'currentPlannedBudget', render: currencyCell('currentPlannedBudget') },
    { key: 'actualBudget', className: 'text-end', label: 'Actual Budget', sortKey: 'actualBudget', render: currencyCell('actualBudget') },
    { key: 'currentPlannedTeamSize', className: 'text-end', label: 'Planned Team Size', sortKey: 'currentPlannedTeamSize', render: numberCell('currentPlannedTeamSize') },
    { key: 'actualTeamSize', className: 'text-end', label: 'Actual Team Size', sortKey: 'actualTeamSize', render: numberCell('actualTeamSize') },
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
  const kpis = widgets.predictionAccuracyKpis || {};
  const roleLabel = role === 'ACCOUNT_MANAGER' ? 'Account Manager' : role || 'Analytics';

  return (
    <div className="fade-in analytics-dashboard">
      <CRow className="mb-4">
        <CCol xs={12}>
          <h1 className="page-title mb-1">AI Governance Analytics</h1>
          <p className="text-muted mb-0">{roleLabel} view of PM prediction vs AI prediction vs actual outcome</p>
        </CCol>
      </CRow>

      {error && <CAlert color="danger">{error}</CAlert>}

      <h2 className="h5 mb-3">
        AI Effectiveness & Prediction Accuracy
        <InfoHint text="Accuracy = 100 - Percentage Error. Higher values indicate better prediction quality." />
      </h2>
      <div className="analytics-kpi-grid mb-4">
        <AccuracyKpi label="AI Effort Accuracy" value={kpis.aiEffortAccuracy} />
        <AccuracyKpi label="PM Effort Accuracy" value={kpis.pmEffortAccuracy} />
        <AccuracyKpi label="AI Budget Accuracy" value={kpis.aiBudgetAccuracy} />
        <AccuracyKpi label="PM Budget Accuracy" value={kpis.pmBudgetAccuracy} />
        <AccuracyKpi label="AI Estimation Accuracy" value={kpis.aiEstimationAccuracy} />
        <AccuracyKpi label="PM Estimation Accuracy" value={kpis.pmEstimationAccuracy} />
        <AccuracyKpi label="AI Staffing Accuracy" value={kpis.aiStaffingAccuracy} />
        <AccuracyKpi label="PM Staffing Accuracy" value={kpis.pmStaffingAccuracy} />
        <WinRateKpi value={kpis.aiVsPmWinRate} />
      </div>

      <WinRateDrilldown comparisons={kpis.aiVsPmWinRate?.comparisons || []} />

      <CRow className="mb-4 g-4">
        <CCol xs={12} md={6} xl={3}>
          <ChartCard title="Effort Prediction Accuracy" data={comparisonChart(widgets.effortPredictionAccuracy)} options={effortComparisonOptions} loading={loading} />
        </CCol>
        <CCol xs={12} md={6} xl={3}>
          <ChartCard title="Budget Prediction Accuracy" data={comparisonChart(widgets.budgetPredictionAccuracy)} options={currencyComparisonOptions} loading={loading} />
        </CCol>
        <CCol xs={12} md={6} xl={3}>
          <ChartCard title="Staffing Prediction Accuracy" data={comparisonChart(widgets.staffingPredictionAccuracy)} options={staffingComparisonOptions} loading={loading} />
        </CCol>
        <CCol xs={12} md={6} xl={3}>
          <ChartCard title="Estimation Accuracy" data={comparisonChart(widgets.estimationComparison)} options={estimationComparisonOptions} loading={loading} />
        </CCol>
      </CRow>

      <h2 className="h5 mb-3">Governance Health & Portfolio Monitoring</h2>
      <CRow className="mb-4 g-4">
        <CCol xs={12} lg={3}>
          <ChartCard
            title="Severity Distribution"
            infoElement={<SeverityInfoHint />}
            data={severityChart(widgets.severityDistribution)}
            options={severityDonutOptions}
            loading={loading}
            type="doughnut"
          />
        </CCol>
        <CCol xs={12} lg={4}>
          <ChartCard
            title="Progress Health Analysis"
            // subtitle="Expected Completion vs Actual Completion"
            data={comparisonChart(widgets.progressCompletionComparison)}
            options={progressOptions}
            loading={loading}
          />
        </CCol>
        <CCol xs={12} lg={5}>
          <AttentionCard rows={widgets.projectsRequiringAttention || []} loading={loading} />
        </CCol>
      </CRow>

      <h2 className="h5 mb-3">Project Analytics Summary</h2>
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

const ChartCard = ({ title, subtitle, infoTitle, info, infoElement, data, options = chartOptions, loading, type = 'bar' }) => (
  <CCard className="h-100 analytics-chart-card">
    <CCardHeader>
      <div className="d-flex align-items-start justify-content-between gap-2">
        <div>
          <div>{title}{infoElement || (info && <InfoHint title={infoTitle} text={info} />)}</div>
          {subtitle && <div className="analytics-chart-subtitle">{subtitle}</div>}
        </div>
      </div>
    </CCardHeader>
    <CCardBody>
      {loading ? (
        <div className="analytics-chart-placeholder text-muted">Loading...</div>
      ) : (
        <div className="analytics-chart-frame">
          {type === 'doughnut' ? <Doughnut data={data} options={options} /> : <Bar data={data} options={options} />}
        </div>
      )}
    </CCardBody>
  </CCard>
);

const AccuracyKpi = ({ label, value }) => {
  const status = getAccuracyStatus(value);
  return (
    <CCard className={`h-100 analytics-kpi-card analytics-kpi-${status}`}>
      <CCardBody>
        <div className="analytics-kpi-label">
          {label}
          <span className={`analytics-kpi-status analytics-kpi-status-${status}`}>{getAccuracyStatusLabel(status)}</span>
        </div>
        <div className="analytics-kpi-value">{formatAccuracy(value)}</div>
      </CCardBody>
    </CCard>
  );
};

const WinRateKpi = ({ value = {} }) => (
    <CCard className="h-100 analytics-kpi-card analytics-kpi-win analytics-kpi-wide">
      <CCardBody>
        <div className="analytics-kpi-label">
          AI Outperformed PM
          <InfoHint text={aiOutperformedTooltip.text} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)'}}>
          <div className="analytics-win-subtext">AI Outperformed {formatAccuracy(value.aiOutperformedPercent)}</div>
          <div className="analytics-win-subtext">PM Outperformed {formatAccuracy(value.pmOutperformedPercent)}</div>
          <div className="analytics-win-subtext">Tie {formatAccuracy(value.tiePercent)}</div>
        </div>
        {/* <div className="analytics-kpi-insight">{buildWinRateInsight(value)}</div> */}
      </CCardBody>
    </CCard>
);

const WinRateDrilldown = ({ comparisons = [] }) => (
  <details className="analytics-win-drilldown mb-4">
    <summary>View comparison drilldown</summary>
    <div className="table-responsive">
      <table className="table table-sm mb-0">
        <thead>
          <tr>
            <th>Project</th>
            <th>Metric</th>
            <th className="text-end">AI Prediction</th>
            <th className="text-end">PM Prediction</th>
            <th className="text-end">Actual</th>
            <th className="text-end">AI Error</th>
            <th className="text-end">PM Error</th>
            <th>Winner</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.length === 0 ? (
            <tr>
              <td colSpan={8} className="text-muted">No comparisons available.</td>
            </tr>
          ) : comparisons.map((row, index) => (
            <tr key={`${row.projectId}-${row.metric}-${index}`}>
              <td>{row.projectName}</td>
              <td>{row.metric}</td>
              <td className="text-end">{formatNumber(row.aiPrediction)}</td>
              <td className="text-end">{formatNumber(row.pmPrediction)}</td>
              <td className="text-end">{formatNumber(row.actual)}</td>
              <td className="text-end">{formatNumber(row.aiError)}</td>
              <td className="text-end">{formatNumber(row.pmError)}</td>
              <td>{formatWinner(row.winner)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </details>
);

const InfoHint = ({ title, text }) => {
  const label = title ? `${title}\n\n${text}` : text;
  return (
    <CTooltip
      content={(
        <div className="analytics-info-tooltip">
          {title && <div className="analytics-info-tooltip-title">{title}</div>}
          <div className="analytics-info-tooltip-body">{text}</div>
        </div>
      )}
      placement="top"
    >
      <span className="analytics-info-hint" aria-label={label} role="img" tabIndex={0}>i</span>
    </CTooltip>
  );
};

const AttentionCard = ({ rows = [], loading }) => (
  <CCard className="h-100 analytics-chart-card">
    <CCardHeader>Projects Requiring Attention</CCardHeader>
    <CCardBody>
      {loading ? (
        <div className="analytics-chart-placeholder text-muted">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="analytics-chart-placeholder text-muted">No projects require attention.</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm mb-0">
            <thead>
              <tr>
                <th>Project</th>
                <th>
                  Severity
                  <SeverityInfoHint />
                </th>
                <th className="text-end">Variance</th>
                <th>Last Progress</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.projectId}>
                  <td className="fw-semibold">{row.projectName}</td>
                  <td>
                    <CBadge color={severityColors[row.severity] || 'secondary'} className={row.severity === 'High' ? 'severity-badge-high' : ''}>
                      {row.severity}
                    </CBadge>
                  </td>
                  <td className="text-end">{formatUnsignedPercent(row.progressVariancePercent)}</td>
                  <td>{formatDisplayDate(row.latestProgressDate)}</td>
                  <td>{row.reason || buildAttentionReason(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    tooltip: {
      callbacks: {
        label: (context) => `${context.dataset.label || 'Value'}: ${formatPercent(context.parsed.y)}`,
      },
    },
  },
  scales: {
    y: {
      title: {
        display: true,
        text: 'Variance (%)',
      },
      ticks: {
        callback: (value) => `${value}%`,
      },
    },
  },
};

const comparisonOptions = {
  ...chartOptions,
  plugins: {
    ...chartOptions.plugins,
    tooltip: {
      callbacks: {
        label: (context) => `${context.dataset.label || 'Value'}: ${compactNumber(context.parsed.y)}`,
      },
    },
  },
  scales: {
    y: {
      title: {
        display: true,
        text: 'Value',
      },
      ticks: {
        callback: (value) => compactNumber(value),
      },
    },
  },
};

const currencyComparisonOptions = {
  ...comparisonOptions,
  plugins: {
    ...comparisonOptions.plugins,
    tooltip: {
      callbacks: {
        label: (context) => `${normalizePredictionLabel(context.dataset.label, 'Budget')}: ${formatCurrency(context.parsed.y)}`,
      },
    },
  },
  scales: {
    y: {
      title: {
        display: true,
        text: 'Budget',
      },
      ticks: {
        callback: (value) => compactNumber(value),
      },
    },
  },
};

const effortComparisonOptions = {
  ...comparisonOptions,
  plugins: {
    ...comparisonOptions.plugins,
    tooltip: {
      callbacks: {
        label: (context) => `${normalizePredictionLabel(context.dataset.label, 'Effort')}: ${formatNumber(context.parsed.y)} PD`,
      },
    },
  },
  scales: {
    y: {
      title: {
        display: true,
        text: 'Effort (PD)',
      },
      ticks: {
        callback: (value) => `${compactNumber(value)} PD`,
      },
    },
  },
};

const staffingComparisonOptions = {
  ...comparisonOptions,
  plugins: {
    ...comparisonOptions.plugins,
    tooltip: {
      callbacks: {
        label: (context) => `${normalizePredictionLabel(context.dataset.label, 'Team Size')}: ${formatNumber(context.parsed.y)}`,
      },
    },
  },
  scales: {
    y: {
      title: {
        display: true,
        text: 'Team Size',
      },
      ticks: {
        precision: 0,
      },
    },
  },
};

const estimationComparisonOptions = {
  ...effortComparisonOptions,
  plugins: {
    ...effortComparisonOptions.plugins,
    tooltip: {
      callbacks: {
        label: (context) => `${context.dataset.label || 'Estimation'}: ${formatNumber(context.parsed.y)} PD`,
      },
    },
  },
};

const progressOptions = {
  ...comparisonOptions,
  plugins: {
    ...comparisonOptions.plugins,
    tooltip: {
      callbacks: {
        title: (items) => items?.[0]?.label ? `Project: ${items[0].label}` : '',
        label: (context) => `${context.dataset.label || 'Completion'}: ${formatUnsignedPercent(context.parsed.y)}`,
        afterBody: (items) => {
          const item = items?.[0];
          if (!item?.chart?.data?.datasets || item.dataIndex === undefined) return '';
          const expected = item.chart.data.datasets[0]?.data?.[item.dataIndex];
          const actual = item.chart.data.datasets[1]?.data?.[item.dataIndex];
          if (expected === null || expected === undefined || actual === null || actual === undefined) return '';
          return `Variance: ${formatUnsignedPercent(Math.abs(Number(expected) - Number(actual)))}`;
        },
      },
    },
  },
  scales: {
    y: {
      min: 0,
      max: 100,
      title: {
        display: true,
        text: 'Completion (%)',
      },
      ticks: {
        callback: (value) => `${value}%`,
      },
    },
  },
};

const severityDonutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'bottom' },
    tooltip: {
      callbacks: {
        label: (context) => {
          const value = Number(context.parsed || 0);
          const total = context.dataset.data.reduce((sum, item) => sum + Number(item || 0), 0);
          const percent = total ? ` (${((value / total) * 100).toFixed(1)}%)` : '';
          return `${context.label}: ${formatNumber(value)} project${value === 1 ? '' : 's'}${percent}`;
        },
      },
    },
  },
};

function comparisonChart(widget = {}) {
  return {
    labels: widget.labels || [],
    datasets: (widget.datasets || []).map((dataset, index) => ({
      ...dataset,
      backgroundColor: ['#2f80ed', '#f9b115', '#2eb85c'][index] || '#6c757d',
      borderColor: ['#2f80ed', '#f9b115', '#2eb85c'][index] || '#6c757d',
      borderWidth: 1,
    })),
  };
}

function severityChart(widget = {}) {
  const colors = ['#6c757d', '#2eb85c', '#f9b115', '#fd7e14', '#e55353'];
  return {
    labels: widget.labels || [],
    datasets: (widget.datasets || []).map((dataset) => ({
      ...dataset,
      backgroundColor: colors,
      borderColor: colors,
      borderWidth: 1,
    })),
  };
}

function getAccuracyStatus(value) {
  if (value === null || value === undefined || value === '') return 'neutral';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'neutral';
  if (numeric > 85) return 'good';
  if (numeric >= 70) return 'warning';
  return 'danger';
}

function getAccuracyStatusLabel(status) {
  if (status === 'good') return 'Strong';
  if (status === 'warning') return 'Watch';
  if (status === 'danger') return 'Risk';
  return 'N/A';
}

function normalizePredictionLabel(label, dimension) {
  if (label === 'PM Prediction') return `PM ${dimension}`;
  if (label === 'AI Predicted') return `AI ${dimension}`;
  if (label === 'Actual') return `Actual ${dimension}`;
  return label || dimension;
}

function buildAttentionReason(row) {
  if (!row.latestProgressDate) return 'No progress captured';
  const expected = Number(row.expectedCompletionPercent);
  const actual = Number(row.actualCompletionPercent);
  const variance = Number(row.progressVariancePercent);
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || !Number.isFinite(variance)) return 'Progress data incomplete';
  if (actual < expected) return `Progress lagging by ${Math.round(variance)}%`;
  if (actual > expected) return `Progress ahead by ${Math.round(variance)}%`;
  if (variance > 20) return 'High completion variance';
  return 'Completion variance requires review';
}

function numberCell(key) {
  return (row) => <span className="text-nowrap">{formatNumber(row[key])}</span>;
}

function currencyCell(key) {
  return (row) => <span className="text-nowrap">{formatCurrency(row[key])}</span>;
}

function compactPercentCell(key) {
  return (row) => <span className="text-nowrap">{row[key] === null || row[key] === undefined ? 'N/A' : `${Number(row[key]).toFixed(0)}%`}</span>;
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

function formatUnsignedPercent(value) {
  if (value === null || value === undefined || value === '') return '-';
  return `${Number(value).toFixed(2)}%`;
}

function formatAccuracy(value) {
  if (value === null || value === undefined || value === '') return '-';
  return `${Number(value).toFixed(1)}%`;
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '-';
  return Number(value).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatDisplayDate(value) {
  const parsed = parseBackendDate(value);
  return parsed ? parsed.format('DD-MMM-YYYY') : 'Never';
}

function compactNumber(value) {
  return Number(value || 0).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
}

function buildWinRateInsight(value = {}) {
  const ai = Number(value.aiOutperformedPercent);
  const pm = Number(value.pmOutperformedPercent);
  if (!Number.isFinite(ai) || !Number.isFinite(pm)) {
    return 'No AI vs PM comparisons are available yet.';
  }
  if (ai > pm) {
    return `AI recommendations were closer to actual outcomes in ${ai.toFixed(1)}% of evaluated comparisons.`;
  }
  if (pm > ai) {
    return 'PM estimates currently outperform AI recommendations based on available project history.';
  }
  return `AI and PM estimates are evenly split across evaluated comparisons at ${ai.toFixed(1)}% each.`;
}

function formatWinner(value) {
  if (value === 'AI') return 'AI Win';
  if (value === 'PM') return 'PM Win';
  return 'Tie';
}

export default AnalyticsOverview;
