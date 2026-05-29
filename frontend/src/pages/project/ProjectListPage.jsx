import React, { useEffect, useMemo, useState } from 'react';
import { CBadge, CButton, CCol, CRow } from '@coreui/react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/dataTable/DataTable';
import TableFilters from '../../components/dataTable/TableFilters';
import TableToolbar from '../../components/dataTable/TableToolbar';
import { listProjects } from '../../services/projectService';
import authService from '../../services/authService';
import { formatDisplayDateTime } from '../../utils/dateUtils';
import { listIndustries } from '../../services/masterDataService';

const statusOptions = ['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'COMPLETE', 'REJECTED'].map((value) => ({ value, label: value }));
const deliveryModelOptions = ['Agile', 'Waterfall', 'Hybrid', 'Scrum', 'Kanban'].map((value) => ({ value, label: value }));

const statusColors = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  RETURNED: 'warning',
  APPROVED: 'success',
  COMPLETE: 'dark',
  REJECTED: 'danger',
};

const severityColors = {
  'Not Measured': 'secondary',
  Normal: 'success',
  Medium: 'warning',
  High: 'danger',
  Urgent: 'dark',
};

const ProjectListPage = () => {
  const navigate = useNavigate();
  const currentRole = String(authService.getUserRole() || '').toUpperCase();
  const isAccountManager = ['ACCOUNT_MANAGER', 'AM'].includes(currentRole);
  const [rows, setRows] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, totalRecords: 0, totalPages: 1 });
  const [sort, setSort] = useState({ sortBy: 'updatedAt', sortOrder: 'DESC' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [industryOptions, setIndustryOptions] = useState([]);

  useEffect(() => {
    let active = true;
    listIndustries()
      .then((result) => {
        if (!active) return;
        setIndustryOptions((result.items || []).map((industry) => ({
          value: industry.industryName,
          label: industry.industryName,
        })));
      })
      .catch(() => {
        if (active) setIndustryOptions([]);
      });
    return () => {
      active = false;
    };
  }, []);

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
    listProjects({
      page: pagination.page,
      pageSize: pagination.pageSize,
      search,
      ...filters,
      ...sort,
    })
      .then((result) => {
        if (!active) return;
        setRows(result.items || []);
        setPagination({
          page: result.page,
          pageSize: result.pageSize,
          totalRecords: result.totalRecords,
          totalPages: result.totalPages,
        });
        setError('');
      })
      .catch((err) => {
        if (active) setError(err.message || 'Failed to load projects');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pagination.page, pagination.pageSize, search, filters, sort]);

  const hasActiveFilters = Boolean(search || Object.values(filters).some(Boolean));

  const columns = useMemo(() => [
    { key: 'projectCode', label: 'Project Code' },
    { key: 'projectName', label: 'Project Name', sortKey: 'projectName' },
    { key: 'clientName', label: 'Client Name' },
    { key: 'industry', label: 'Industry' },
    { key: 'deliveryModel', label: 'Delivery Model' },
    {
      key: 'severity',
      label: 'Severity',
      render: (row) => <CBadge color={severityColors[row.severity] || 'secondary'}>{row.severity || 'Not Measured'}</CBadge>,
    },
    {
      key: 'currentStatus',
      label: 'Current Status',
      sortKey: 'status',
      render: (row) => <CBadge color={statusColors[row.currentStatus] || 'secondary'}>{row.currentStatus}</CBadge>,
    },
    { key: 'createdAt', label: 'Created Date', sortKey: 'createdAt', render: (row) => formatDisplayDateTime(row.createdAt) },
    { key: 'updatedAt', label: 'Last Updated', sortKey: 'updatedAt', render: (row) => formatDisplayDateTime(row.updatedAt) },
    { key: 'reviewerComment', label: 'Reviewer Comment' },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="d-flex gap-2">
          {row.currentStatus === 'APPROVED' ? (
            <>
              <CButton color="primary" variant="outline" size="sm" onClick={() => navigate(`/projects/view/${row.publishedProjectId || row.projectId}`)}>
                View
              </CButton>
              {row.canCreateCr && (
                <CButton color="secondary" variant="outline" size="sm" onClick={() => navigate(`/crs/create?projectId=${row.publishedProjectId || row.projectId}`)}>
                  Create CR
                </CButton>
              )}
              {row.canTrackProgress && !isAccountManager && (
                <CButton color="info" variant="outline" size="sm" onClick={() => navigate(`/progress/${row.publishedProjectId || row.projectId}`)}>
                  Progress
                </CButton>
              )}
              {row.canComplete && !isAccountManager && (
                <CButton color="success" variant="outline" size="sm" onClick={() => navigate(`/projects/complete/${row.publishedProjectId || row.projectId}`)}>
                  Complete
                </CButton>
              )}
            </>
          ) : (
            <CButton color="primary" variant="outline" size="sm" onClick={() => navigate(`/projects/${row.draftId || row.projectId}`)}>
              View
            </CButton>
          )}
          {row.canEdit && (
            <CButton color="secondary" variant="outline" size="sm" onClick={() => navigate(`/projects/edit/${row.draftId || row.projectId}`)}>
              Edit
            </CButton>
          )}
          {['DRAFT', 'RETURNED'].includes(row.currentStatus) && (
            <CButton color="success" variant="outline" size="sm" onClick={() => navigate(`/projects/edit/${row.draftId || row.projectId}`)}>
              Submit
            </CButton>
          )}
        </div>
      ),
    },
  ], [isAccountManager, navigate]);

  const filterConfig = [
    { key: 'status', label: 'Status', type: 'select', options: statusOptions },
    { key: 'industry', label: 'Industry', type: 'select', options: industryOptions },
    { key: 'deliveryModel', label: 'Delivery Model', type: 'select', options: deliveryModelOptions },
    { key: 'createdFrom', label: 'Created From', type: 'date' },
    { key: 'createdTo', label: 'Created To', type: 'date' },
  ];

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
    setFilters({});
    setPagination((current) => ({ ...current, page: 1 }));
  };

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <h1 className="page-title mb-1">{isAccountManager ? 'Projects for Review' : 'My Projects'}</h1>
          <p className="text-muted mb-0">
            {isAccountManager ? 'Submitted and approved projects assigned to you' : 'Projects raised by you'}
          </p>
        </CCol>
      </CRow>

      <TableToolbar
        search={searchInput}
        searchPlaceholder="Search project name, client, or code"
        onSearchChange={setSearchInput}
        onReset={resetFilters}
      />
      <TableFilters
        filters={filters}
        onChange={(nextFilters) => {
          setPagination((current) => ({ ...current, page: 1 }));
          setFilters(nextFilters);
        }}
        config={filterConfig}
      />
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        sortBy={sort.sortBy}
        sortOrder={sort.sortOrder}
        onSort={handleSort}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalRecords={pagination.totalRecords}
        totalPages={pagination.totalPages}
        onPageChange={(page) => setPagination((current) => ({ ...current, page }))}
        onPageSizeChange={(pageSize) => setPagination((current) => ({ ...current, page: 1, pageSize }))}
        emptyMessage="No projects raised yet."
        noResultsMessage="No projects match the current filters."
        hasActiveFilters={hasActiveFilters}
      />
    </div>
  );
};

export default ProjectListPage;
