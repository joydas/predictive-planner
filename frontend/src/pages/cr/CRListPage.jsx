import React, { useEffect, useMemo, useState } from 'react';
import { CBadge, CButton, CCol, CRow } from '@coreui/react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/dataTable/DataTable';
import TableFilters from '../../components/dataTable/TableFilters';
import TableToolbar from '../../components/dataTable/TableToolbar';
import { listChangeRequests } from '../../services/crService';
import authService from '../../services/authService';
import { formatDisplayDateTime } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/resourcePlanning';

const statusOptions = ['DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED', 'REJECTED'].map((value) => ({ value, label: value }));
const severityOptions = ['Low', 'Medium', 'High', 'Critical'].map((value) => ({ value, label: value }));
const categoryOptions = ['Scope', 'Schedule', 'Cost', 'Quality', 'Risk'].map((value) => ({ value, label: value }));

const statusColors = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  RETURNED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

const CRListPage = () => {
  const navigate = useNavigate();
  const isAccountManager = String(authService.getUserRole() || '').toUpperCase() === 'ACCOUNT_MANAGER';
  const [rows, setRows] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, totalRecords: 0, totalPages: 1 });
  const [sort, setSort] = useState({ sortBy: 'updatedAt', sortOrder: 'DESC' });
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
    listChangeRequests({
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
        if (active) setError(err.message || 'Failed to load change requests');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pagination.page, pagination.pageSize, search, filters, sort]);

  const columns = useMemo(() => [
    { key: 'crNumber', label: 'CR Number' },
    { key: 'projectName', label: 'Project', sortKey: 'projectName' },
    { key: 'severity', label: 'Severity', sortKey: 'severity' },
    { key: 'priority', label: 'Priority', sortKey: 'priority' },
    {
      key: 'currentStatus',
      label: 'Current Status',
      sortKey: 'status',
      render: (row) => <CBadge color={statusColors[row.currentStatus] || 'secondary'}>{row.currentStatus}</CBadge>,
    },
    { key: 'scheduleImpactDays', label: 'Schedule Impact', sortKey: 'scheduleImpactDays', render: (row) => `${row.scheduleImpactDays ?? 0} days` },
    { key: 'additionalBudget', label: 'Additional Budget Impact', sortKey: 'additionalBudget', render: (row) => formatCurrency(row.additionalBudget || 0) },
    { key: 'latestComment', label: 'Last Comment' },
    { key: 'updatedAt', label: 'Updated Date', sortKey: 'updatedAt', render: (row) => formatDisplayDateTime(row.updatedAt) },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="d-flex gap-2">
          <CButton color="primary" variant="outline" size="sm" onClick={() => navigate(`/crs/${row.crId}`)}>
            View
          </CButton>
          {row.canEdit && (
            <CButton color="secondary" variant="outline" size="sm" onClick={() => navigate(`/crs/create?crId=${row.crId}`)}>
              Edit
            </CButton>
          )}
        </div>
      ),
    },
  ], [navigate]);

  const filterConfig = [
    { key: 'status', label: 'Status', type: 'select', options: statusOptions },
    { key: 'severity', label: 'Severity', type: 'select', options: severityOptions },
    { key: 'category', label: 'Category', type: 'select', options: categoryOptions },
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

  const hasActiveFilters = Boolean(search || Object.values(filters).some(Boolean));

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <h1 className="page-title mb-1">{isAccountManager ? 'Change Requests for Review' : 'My Change Requests'}</h1>
          <p className="text-muted mb-0">
            {isAccountManager ? 'Submitted and approved change requests assigned to you' : 'Change requests raised by you'}
          </p>
        </CCol>
      </CRow>

      {!isAccountManager && (
        <div className="d-flex justify-content-end mb-3">
          <CButton color="primary" onClick={() => navigate('/crs/create')}>
            Create CR
          </CButton>
        </div>
      )}

      <TableToolbar
        search={searchInput}
        searchPlaceholder="Search CR number or project name"
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
        emptyMessage="No change requests raised yet."
        noResultsMessage="No change requests match the current filters."
        hasActiveFilters={hasActiveFilters}
      />
    </div>
  );
};

export default CRListPage;
