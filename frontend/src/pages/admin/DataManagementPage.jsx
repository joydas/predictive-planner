import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCol,
  CFormCheck,
  CFormInput,
  CFormSelect,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CRow,
} from '@coreui/react';
import { useNavigate } from 'react-router-dom';
import DataTable from '../../components/dataTable/DataTable';
import authService from '../../services/authService';
import {
  bulkDeleteDataProjects,
  deleteDataProject,
  getProjectDeleteSummary,
  listDataProjects,
} from '../../services/adminService';
import { formatDisplayDateTime } from '../../utils/dateUtils';

const statusColor = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  RETURNED: 'warning',
  APPROVED: 'success',
  COMPLETE: 'dark',
  REJECTED: 'danger',
};

const valueOrDash = (value) => (value === null || value === undefined || value === '' ? '-' : value);

const DataManagementPage = () => {
  const isAdmin = String(authService.getUserRole() || '').toUpperCase() === 'ADMIN';
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ search: '', status: '', includeRegressionData: false });
  const [selected, setSelected] = useState({});
  const [summary, setSummary] = useState(null);
  const [deleteMode, setDeleteMode] = useState('single');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedProjects = useMemo(
    () => items.filter((item) => selected[`${item.draftId}-${item.projectId || 'draft'}`]),
    [items, selected],
  );

  const loadProjects = useCallback(async (next = {}) => {
    setLoading(true);
    try {
      const result = await listDataProjects({
        page: next.page || pagination.page,
        pageSize: next.pageSize || pagination.pageSize,
        search: next.search ?? filters.search,
        status: next.status ?? filters.status,
        includeRegressionData: next.includeRegressionData ?? filters.includeRegressionData,
      });
      setItems(result.items || []);
      setPagination(result.pagination || { page: 1, pageSize: 20, total: 0 });
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [filters.includeRegressionData, filters.search, filters.status, pagination.page, pagination.pageSize]);

  useEffect(() => {
    if (isAdmin) loadProjects({ page: 1 });
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFilter = (field, value) => {
    const nextFilters = { ...filters, [field]: value };
    setFilters(nextFilters);
    setSelected({});
    loadProjects({ ...nextFilters, page: 1 });
  };

  const openSingleDelete = async (project) => {
    setDeleteMode('single');
    setConfirmation('');
    setError('');
    setSummary(null);
    try {
      setSummary(await getProjectDeleteSummary(project));
    } catch (err) {
      setError(err.message || 'Failed to load deletion summary');
    }
  };

  const openBulkDelete = () => {
    setDeleteMode('bulk');
    setConfirmation('');
    setSummary({
      project: { projectCode: `${selectedProjects.length} selected projects`, projectName: 'Bulk Delete' },
      relatedRecords: null,
    });
  };

  const closeDelete = () => {
    if (deleting) return;
    setSummary(null);
    setConfirmation('');
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    setMessage('');
    try {
      if (deleteMode === 'bulk') {
        await bulkDeleteDataProjects(selectedProjects.map(({ draftId, projectId }) => ({ draftId, projectId })), confirmation);
        setMessage('Projects deleted successfully. All related records were removed.');
        setSelected({});
      } else {
        await deleteDataProject({
          draftId: summary.project.draftId,
          projectId: summary.project.projectId,
        }, confirmation);
        setMessage('Project deleted successfully. All related records were removed.');
      }
      setSummary(null);
      setConfirmation('');
      await loadProjects({ page: 1 });
    } catch (err) {
      setError(err.message || 'Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelected = (project, checked) => {
    const key = `${project.draftId}-${project.projectId || 'draft'}`;
    setSelected((current) => ({ ...current, [key]: checked }));
  };

  const columns = useMemo(() => {
    const isAllSelected = items.length > 0 && items.every((row) => selected[`${row.draftId}-${row.projectId || 'draft'}`]);

    const toggleAll = (checked) => {
      const nextSelected = { ...selected };
      items.forEach((row) => {
        const key = `${row.draftId}-${row.projectId || 'draft'}`;
        if (checked) nextSelected[key] = true;
        else delete nextSelected[key];
      });
      setSelected(nextSelected);
    };

    return [
      {
        key: 'select',
        label: (
          <CFormCheck
            checked={isAllSelected}
            onChange={(event) => toggleAll(event.target.checked)}
          />
        ),
        render: (row) => (
          <CFormCheck
            checked={!!selected[`${row.draftId}-${row.projectId || 'draft'}`]}
            onChange={(event) => toggleSelected(row, event.target.checked)}
          />
        ),
      },
      { key: 'projectCode', label: 'Project Code' },
      { key: 'projectName', label: 'Project Name' },
      { key: 'clientName', label: 'Client', render: (row) => valueOrDash(row.clientName) },
      {
        key: 'status',
        label: 'Status',
        render: (row) => <CBadge color={statusColor[String(row.status || '').toUpperCase()] || 'secondary'}>{row.status}</CBadge>,
      },
      {
        key: 'isRegressionData',
        label: 'Data Type',
        render: (row) => row.isRegressionData ? <CBadge color="warning">Regression</CBadge> : <CBadge color="secondary">Standard</CBadge>,
      },
      { key: 'createdBy', label: 'Created By', render: (row) => valueOrDash(row.createdBy) },
      { key: 'createdDate', label: 'Created Date', render: (row) => formatDisplayDateTime(row.createdDate) },
      {
        key: 'actions',
        label: 'Actions',
        render: (row) => (
          <div className="d-flex gap-2">
            <CButton
              color="primary"
              variant="outline"
              size="sm"
              onClick={() => navigate(row.projectId ? `/projects/view/${row.projectId}` : `/projects/edit/${row.draftId}`)}
            >
              View
            </CButton>
            <CButton color="danger" variant="outline" size="sm" onClick={() => openSingleDelete(row)}>
              Delete
            </CButton>
          </div>
        ),
      },
    ];
  }, [items, navigate, selected]);

  if (!isAdmin) {
    return <CAlert color="danger">Administration access requires ADMIN role.</CAlert>;
  }

  const relatedRecords = summary?.relatedRecords || {};

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <h1 className="page-title mb-1">Data Management</h1>
          <p className="text-muted mb-0">Safely remove development, test, or experimental projects and all dependent data.</p>
        </CCol>
      </CRow>

      {message && <CAlert color="success">{message}</CAlert>}
      {error && <CAlert color="danger">{error}</CAlert>}

      <CCard className="mb-3">
        <CCardBody>
          <CRow className="g-3 align-items-end">
            <CCol md={5}>
              <label className="form-label">Search</label>
              <CFormInput
                placeholder="Project code, name, client, or id"
                value={filters.search}
                onChange={(event) => updateFilter('search', event.target.value)}
              />
            </CCol>
            <CCol md={3}>
              <label className="form-label">Status</label>
              <CFormSelect value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
                <option value="">All statuses</option>
                {Object.keys(statusColor).map((status) => <option key={status} value={status}>{status}</option>)}
              </CFormSelect>
            </CCol>
            <CCol md={2}>
              <CFormCheck
                id="includeRegressionData"
                label="Include regression data"
                checked={filters.includeRegressionData}
                onChange={(event) => updateFilter('includeRegressionData', event.target.checked)}
              />
            </CCol>
            <CCol md={2} className="d-flex gap-2 justify-content-md-end">
              <CButton color="secondary" variant="outline" onClick={() => loadProjects()}>Refresh</CButton>
              <CButton color="danger" disabled={selectedProjects.length === 0} onClick={openBulkDelete}>
                Delete Multiple Projects
              </CButton>
            </CCol>
          </CRow>
        </CCardBody>
      </CCard>

      <DataTable
        columns={columns}
        rows={items}
        loading={loading}
        error=""
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalRecords={pagination.total}
        totalPages={Math.max(1, Math.ceil((pagination.total || 0) / (pagination.pageSize || 20)))}
        onPageChange={(page) => loadProjects({ page })}
        onPageSizeChange={(pageSize) => loadProjects({ page: 1, pageSize })}
        emptyMessage="No projects found."
      />

      <CModal visible={!!summary} onClose={closeDelete} backdrop="static">
        <CModalHeader>
          <CModalTitle>Delete Project</CModalTitle>
        </CModalHeader>
        <CModalBody>
          <p><strong>Project:</strong> {summary?.project?.projectCode}</p>
          <p><strong>Name:</strong> {summary?.project?.projectName}</p>
          {deleteMode === 'bulk' ? (
            <CAlert color="warning">This will permanently delete {selectedProjects.length} selected projects and their dependent data.</CAlert>
          ) : (
            <>
              <h6>Related Records</h6>
              <ul>
                <li>CRs: {relatedRecords.changeRequests || 0}</li>
                <li>Progress Snapshots: {relatedRecords.progressSnapshots || 0}</li>
                <li>Forecast Snapshots: {relatedRecords.forecastSnapshots || 0}</li>
                <li>Approval / Workflow Records: {(relatedRecords.projectWorkflowHistory || 0) + (relatedRecords.crWorkflowHistory || 0)}</li>
                <li>ML Logs / Feedback: {(relatedRecords.mlPredictionLogs || 0) + (relatedRecords.mlPredictionFeedback || 0) + (relatedRecords.plPredictionFeedback || 0)}</li>
              </ul>
            </>
          )}
          <CAlert color="danger">
            This action permanently deletes project data, CRs, progress history, forecast history, approval history, and ML-linked records.
          </CAlert>
          <label className="form-label">Type DELETE to continue</label>
          <CFormInput value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={closeDelete} disabled={deleting}>Cancel</CButton>
          <CButton color="danger" onClick={handleDelete} disabled={confirmation !== 'DELETE' || deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </CButton>
        </CModalFooter>
      </CModal>
    </div>
  );
};

export default DataManagementPage;
