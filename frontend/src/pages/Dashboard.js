import React, { useEffect, useMemo, useState } from 'react';
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CFormInput,
  CRow,
  CSpinner,
} from '@coreui/react';
import { useNavigate } from 'react-router-dom';
import { getOperationalDashboard } from '../services/operationalDashboardService';
import TablePagination from '../components/dataTable/TablePagination';
import { parseBackendDate } from '../utils/dateFormat';

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const formatNumber = (value) => numberFormatter.format(Number(value || 0));
const formatCurrency = (value) => currencyFormatter.format(Number(value || 0));
const formatCompactPercent = (value) => (value === null || value === undefined ? 'N/A' : `${Number(value || 0).toFixed(0)}%`);
const formatDashboardDate = (value) => {
  const parsed = parseBackendDate(value);
  return parsed ? parsed.format('DD-MMM-YYYY') : 'N/A';
};
const formatProgressAge = (value) => {
  const parsed = parseBackendDate(value);
  if (!parsed) return 'Never';
  const today = parseBackendDate(new Date().toISOString());
  const days = today ? Math.max(0, today.startOf('day').diff(parsed.startOf('day'), 'day')) : 0;
  if (days === 0) return 'Today';
  return `${days} ${days === 1 ? 'Day' : 'Days'}`;
};
const formatCompactCurrency = (value) => {
  const numeric = Number(value || 0);
  const absolute = Math.abs(numeric);
  if (absolute >= 1000000) return `$${(numeric / 1000000).toFixed(1)}M`;
  if (absolute >= 1000) return `$${(numeric / 1000).toFixed(1)}K`;
  return formatCurrency(numeric);
};

const statusColor = {
  APPROVED: 'success',
  COMPLETE: 'secondary',
  CLOSED: 'secondary',
  SUBMITTED: 'warning',
  RETURNED: 'danger',
  REJECTED: 'dark',
  DRAFT: 'info',
};

const actionColor = {
  'Pending Approval': 'warning',
  'Returned for Rework': 'danger',
  'Pending Submission': 'info',
  'Progress Required': 'danger',
  'Progress Pending': 'info',
  'CR Pending': 'warning',
  'Action Required': 'danger',
  'On Track': 'success',
};

const severityColor = {
  'Not Measured': 'secondary',
  Normal: 'success',
  Medium: 'warning',
  High: 'warning',
  Urgent: 'danger',
};

function StatusBadge({ value }) {
  const normalized = String(value || '-').toUpperCase();
  return (
    <CBadge color={statusColor[normalized] || 'secondary'} shape="rounded-pill">
      {normalized}
    </CBadge>
  );
}

function SeverityBadge({ value }) {
  const label = value || 'Not Measured';
  return (
    <CBadge
      color={severityColor[label] || 'secondary'}
      className={label === 'High' ? 'severity-badge-high' : ''}
      shape="rounded-pill"
    >
      {label}
    </CBadge>
  );
}

function ActionBadges({ actions = [] }) {
  return (
    <div className="operational-badge-list">
      {actions.map((action) => (
        <CBadge key={action} color={actionColor[action] || 'secondary'} shape="rounded-pill">
          {action}
        </CBadge>
      ))}
    </div>
  );
}

function RowActions({ project, canManageProject }) {
  const navigate = useNavigate();
  return (
    <div className="operational-row-actions">
      <CButton size="sm" color="primary" variant="outline" onClick={() => navigate(`/projects/view/${project.projectId}`)}>
        View
      </CButton>
      {canManageProject && (
        <>
          <CButton size="sm" color="info" variant="outline" onClick={() => navigate(`/progress/${project.projectId}`)}>
            Progress
          </CButton>
          <CButton size="sm" color="success" variant="outline" onClick={() => navigate(`/crs/create?projectId=${project.projectId}`)}>
            Create CR
          </CButton>
        </>
      )}
    </div>
  );
}

function ProjectMetrics({ project }) {
  return (
    <div className="project-metrics-stack">
      <div><span>Effort:</span><strong>{formatNumber(project.currentPlannedEffort)} PD</strong></div>
      <div><span>Budget:</span><strong>{formatCompactCurrency(project.currentPlannedBudget)}</strong></div>
      <div><span>Team:</span><strong>{formatNumber(project.currentPlannedTeamSize)}</strong></div>
      <div><span>CRs:</span><strong>{formatNumber(project.approvedCrCount)}</strong></div>
    </div>
  );
}

function KpiTile({ label, value, meta }) {
  return (
    <CCol xs={12} sm={6} xl className="mb-3">
      <CCard className="operational-kpi h-100">
        <CCardBody>
          <div className="operational-kpi-label">{label}</div>
          <div className="operational-kpi-value">{value}</div>
          {meta && <div className="operational-kpi-meta">{meta}</div>}
        </CCardBody>
      </CCard>
    </CCol>
  );
}

function EmptyRow({ colSpan, label }) {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center text-muted py-4">
        {label}
      </td>
    </tr>
  );
}

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeProjectsPage, setActiveProjectsPage] = useState(1);
  const [activeProjectsPageSize, setActiveProjectsPageSize] = useState(10);
  const [workflowPage, setWorkflowPage] = useState(1);
  const [workflowPageSize, setWorkflowPageSize] = useState(10);
  const [activeProjectsSearchInput, setActiveProjectsSearchInput] = useState('');
  const [workflowSearchInput, setWorkflowSearchInput] = useState('');
  const [activeProjectsSearch, setActiveProjectsSearch] = useState('');
  const [workflowSearch, setWorkflowSearch] = useState('');

  const query = useMemo(() => ({
    activeProjectsPage,
    activeProjectsPageSize,
    workflowPage,
    workflowPageSize,
    activeProjectsSearch,
    workflowSearch,
  }), [
    activeProjectsPage,
    activeProjectsPageSize,
    workflowPage,
    workflowPageSize,
    activeProjectsSearch,
    workflowSearch,
  ]);

  useEffect(() => {
    let mounted = true;
    async function fetchDashboard() {
      try {
        setLoading(true);
        const result = await getOperationalDashboard(query);
        if (mounted) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          console.error('Error fetching operational dashboard:', err);
          setError('Failed to load operational dashboard data.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchDashboard();
    return () => {
      mounted = false;
    };
  }, [query]);

  const submitActiveProjectSearch = (event) => {
    event.preventDefault();
    setActiveProjectsPage(1);
    setActiveProjectsSearch(activeProjectsSearchInput.trim());
  };

  const submitWorkflowSearch = (event) => {
    event.preventDefault();
    setWorkflowPage(1);
    setWorkflowSearch(workflowSearchInput.trim());
  };

  if (loading && !data) {
    return (
      <div className="fade-in">
        <h1 className="page-title text-gradient-primary">Operational Dashboard</h1>
        <CCard>
          <CCardBody className="text-center py-5">
            <CSpinner color="primary" />
            <p className="mt-3 text-muted">Loading operational dashboard...</p>
          </CCardBody>
        </CCard>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="fade-in">
        <h1 className="page-title text-gradient-primary">Operational Dashboard</h1>
        <CAlert color="danger">{error}</CAlert>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const activeProjects = data?.activeProjects || { items: [], page: 1, pageSize: 10, totalRecords: 0, totalPages: 1 };
  const workflowQueue = data?.workflowQueue || { items: [], page: 1, pageSize: 10, totalRecords: 0, totalPages: 1 };
  const crSnapshot = data?.crSnapshot || {};
  const canManageProject = String(data?.role || '').toUpperCase() === 'PM';

  return (
    <div className="fade-in operational-dashboard">
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-2 mb-4">
        <div>
          <h1 className="page-title text-gradient-primary mb-1">Operational Dashboard</h1>
          <div className="text-muted">Execution visibility, pending actions, and active governance.</div>
        </div>
        {loading && <CSpinner color="primary" size="sm" />}
      </div>

      {error && <CAlert color="danger">{error}</CAlert>}

      <CRow className="operational-kpi-row">
        <KpiTile label="Approved Projects" value={formatNumber(kpis.approvedProjects)} />
        <KpiTile label="Completed Projects" value={formatNumber(kpis.completedProjects)} />
        <KpiTile label="Total Active Projects" value={formatNumber(kpis.activeProjects)} />
        <KpiTile label="Total Planned Effort (PD)" value={formatNumber(kpis.totalPlannedEffort)} meta="Current plan in person days" />
        <KpiTile label="Total Resource Count" value={formatNumber(kpis.totalResourceCount)} meta="Planned team size" />
      </CRow>

      <CCard className="operational-section">
        <CCardHeader>
          <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-2">
            <strong>My Active Projects</strong>
            <form className="operational-search" onSubmit={submitActiveProjectSearch}>
              <CFormInput
                size="sm"
                value={activeProjectsSearchInput}
                placeholder="Search projects"
                onChange={(event) => setActiveProjectsSearchInput(event.target.value)}
              />
              <CButton size="sm" color="primary" type="submit">Search</CButton>
            </form>
          </div>
        </CCardHeader>
        <CCardBody className="p-0">
          <div className="table-responsive">
            <table className="table table-sm operational-table">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Client</th>
                  <th>Technology</th>
                  <th>Current Status</th>
                  <th className="text-center">Planned End Date</th>
                  <th className="text-center">Progress Age</th>
                  <th className="text-end">Progress</th>
                  <th>Severity</th>
                  <th className="text-end">Project Metrics</th>
                  <th>Pending Actions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeProjects.items.length === 0 ? (
                  <EmptyRow colSpan={11} label="No active approved projects found." />
                ) : activeProjects.items.map((project) => (
                  <tr key={project.projectId}>
                    <td className="fw-semibold">{project.projectName}</td>
                    <td>{project.clientName}</td>
                    <td>{project.technology}</td>
                    <td><StatusBadge value={project.currentStatus} /></td>
                    <td className="text-center">{formatDashboardDate(project.plannedEndDate)}</td>
                    <td className="text-center">{formatProgressAge(project.latestProgressDate)}</td>
                    <td className="text-end">{formatCompactPercent(project.actualCompletionPercent)}</td>
                    <td><SeverityBadge value={project.severity} /></td>
                    <td className="text-end"><ProjectMetrics project={project} /></td>
                    <td><ActionBadges actions={project.pendingActions} /></td>
                    <td><RowActions project={project} canManageProject={canManageProject} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={activeProjects.page}
            pageSize={activeProjects.pageSize}
            totalRecords={activeProjects.totalRecords}
            totalPages={activeProjects.totalPages}
            onPageChange={setActiveProjectsPage}
            onPageSizeChange={(size) => {
              setActiveProjectsPage(1);
              setActiveProjectsPageSize(size);
            }}
          />
        </CCardBody>
      </CCard>

      <CCard className="operational-section">
        <CCardHeader>
          <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-2">
            <strong>Pending Approvals / Returns</strong>
            <form className="operational-search" onSubmit={submitWorkflowSearch}>
              <CFormInput
                size="sm"
                value={workflowSearchInput}
                placeholder="Search workflow items"
                onChange={(event) => setWorkflowSearchInput(event.target.value)}
              />
              <CButton size="sm" color="primary" type="submit">Search</CButton>
            </form>
          </div>
        </CCardHeader>
        <CCardBody className="p-0">
          <div className="table-responsive">
            <table className="table table-sm operational-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Submitted By</th>
                  <th>Current Status</th>
                  <th className="text-end">Age (Days)</th>
                  <th>Action Required</th>
                </tr>
              </thead>
              <tbody>
                {workflowQueue.items.length === 0 ? (
                  <EmptyRow colSpan={7} label="No pending workflow items found." />
                ) : workflowQueue.items.map((item) => (
                  <tr key={`${item.type}-${item.id}`}>
                    <td>{item.type}</td>
                    <td className="fw-semibold">{item.name}</td>
                    <td>{item.submittedBy}</td>
                    <td><StatusBadge value={item.currentStatus} /></td>
                    <td className="text-end">{formatNumber(item.ageDays)}</td>
                    <td><ActionBadges actions={[item.actionRequired]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={workflowQueue.page}
            pageSize={workflowQueue.pageSize}
            totalRecords={workflowQueue.totalRecords}
            totalPages={workflowQueue.totalPages}
            onPageChange={setWorkflowPage}
            onPageSizeChange={(size) => {
              setWorkflowPage(1);
              setWorkflowPageSize(size);
            }}
          />
        </CCardBody>
      </CCard>

      <CCard className="operational-section">
        <CCardHeader><strong>CR Snapshot</strong></CCardHeader>
        <CCardBody>
          <CRow className="g-3">
            <KpiTile label="Total CR Count" value={formatNumber(crSnapshot.totalCrCount)} />
            <KpiTile label="Approved CR Count" value={formatNumber(crSnapshot.approvedCrCount)} />
            <KpiTile label="Pending CR Count" value={formatNumber(crSnapshot.pendingCrCount)} />
            <KpiTile label="Rejected / Returned CR Count" value={formatNumber(crSnapshot.rejectedReturnedCrCount)} />
            <KpiTile label="Cumulative CR Effort Impact (PD)" value={formatNumber(crSnapshot.cumulativeCrEffortImpact)} />
            <KpiTile label="Cumulative CR Additional Budget Impact" value={formatCurrency(crSnapshot.cumulativeCrBudgetImpact)} />
          </CRow>
        </CCardBody>
      </CCard>
    </div>
  );
};

export default Dashboard;
