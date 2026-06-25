import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CAlert,
  CBadge,
  CButton,
  CCol,
  CFormInput,
  CFormSelect,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CRow,
} from '@coreui/react';
import DataTable from '../../components/dataTable/DataTable';
import {
  createOrganization,
  getOrganizationSummary,
  listOrganizations,
  updateOrganization,
} from '../../services/administrationService';
import authService from '../../services/authService';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/dateUtils';

const emptyForm = {
  organizationId: null,
  organizationName: '',
  organizationCode: '',
  status: 'ACTIVE',
};

const statusBadge = (status) => {
  const active = String(status || '').toUpperCase() === 'ACTIVE';
  return <CBadge color={active ? 'success' : 'secondary'}>{active ? 'ACTIVE' : 'INACTIVE'}</CBadge>;
};

const OrganizationManagementPage = () => {
  const isSuperAdmin = String(authService.getUserRole() || '').toUpperCase() === 'SUPER_ADMIN';
  const [organizations, setOrganizations] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [modalVisible, setModalVisible] = useState(false);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listOrganizations();
      setOrganizations(result.items || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) loadOrganizations();
  }, [isSuperAdmin, loadOrganizations]);

  const openCreate = () => {
    setForm(emptyForm);
    setModalVisible(true);
    setError('');
    setMessage('');
  };

  const openEdit = (organization) => {
    setForm({
      organizationId: organization.organizationId,
      organizationName: organization.organizationName || '',
      organizationCode: organization.organizationCode || '',
      status: organization.status || 'ACTIVE',
    });
    setModalVisible(true);
    setError('');
    setMessage('');
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveOrganization = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        organizationName: form.organizationName,
        organizationCode: form.organizationCode,
        status: form.status,
      };
      if (form.organizationId) {
        await updateOrganization(form.organizationId, payload);
        setMessage('Organization updated.');
      } else {
        await createOrganization(payload);
        setMessage('Organization created.');
      }
      setModalVisible(false);
      await loadOrganizations();
    } catch (err) {
      setError(err.message || 'Unable to save organization');
    } finally {
      setSaving(false);
    }
  };

  const openSummary = async (organization) => {
    setError('');
    try {
      const result = await getOrganizationSummary(organization.organizationId);
      setSummary(result.summary);
    } catch (err) {
      setError(err.message || 'Unable to load organization summary');
    }
  };

  const columns = useMemo(() => [
    { key: 'organizationName', label: 'Organization Name' },
    { key: 'organizationCode', label: 'Organization Code' },
    { key: 'status', label: 'Status', render: (row) => statusBadge(row.status) },
    { key: 'createdAt', label: 'Created Date', render: (row) => formatDisplayDate(row.createdAt) },
    { key: 'userCount', label: 'User Count' },
    { key: 'projectCount', label: 'Project Count' },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="d-flex gap-2">
          <CButton color="primary" variant="outline" size="sm" onClick={() => openSummary(row)}>Summary</CButton>
          <CButton color="primary" size="sm" onClick={() => openEdit(row)}>Edit</CButton>
        </div>
      ),
    },
  ], []);

  if (!isSuperAdmin) {
    return <CAlert color="danger">Administration access requires SUPER_ADMIN role.</CAlert>;
  }

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12} className="d-flex justify-content-between align-items-start gap-3">
          <div>
            <h1 className="page-title mb-1">Organizations</h1>
            <p className="text-muted mb-0">Create tenants, edit tenant identity, and deactivate tenant access.</p>
          </div>
          <CButton color="primary" onClick={openCreate}>Create Organization</CButton>
        </CCol>
      </CRow>

      {message && <CAlert color="success">{message}</CAlert>}
      {error && <CAlert color="danger">{error}</CAlert>}

      <DataTable
        columns={columns}
        rows={organizations}
        loading={loading}
        error=""
        page={1}
        pageSize={organizations.length || 10}
        totalRecords={organizations.length}
        totalPages={1}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        emptyMessage="No organizations configured."
      />

      <CModal visible={modalVisible} onClose={() => setModalVisible(false)} backdrop="static">
        <form onSubmit={saveOrganization}>
          <CModalHeader>
            <CModalTitle>{form.organizationId ? 'Edit Organization' : 'Create Organization'}</CModalTitle>
          </CModalHeader>
          <CModalBody>
            <CRow className="g-3">
              <CCol xs={12}>
                <label className="form-label">Organization Name</label>
                <CFormInput value={form.organizationName} onChange={(event) => updateForm('organizationName', event.target.value)} required />
              </CCol>
              <CCol xs={12}>
                <label className="form-label">Organization Code</label>
                <CFormInput value={form.organizationCode} onChange={(event) => updateForm('organizationCode', event.target.value)} required />
              </CCol>
              <CCol xs={12}>
                <label className="form-label">Status</label>
                <CFormSelect value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </CFormSelect>
              </CCol>
            </CRow>
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" variant="outline" type="button" onClick={() => setModalVisible(false)}>Cancel</CButton>
            <CButton color="primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</CButton>
          </CModalFooter>
        </form>
      </CModal>

      <CModal visible={!!summary} onClose={() => setSummary(null)}>
        <CModalHeader>
          <CModalTitle>Organization Summary</CModalTitle>
        </CModalHeader>
        <CModalBody>
          {summary && (
            <div className="admin-summary-grid">
              <div><span>Total Users</span><strong>{summary.totalUsers}</strong></div>
              <div><span>Total Projects</span><strong>{summary.totalProjects}</strong></div>
              <div><span>Active Projects</span><strong>{summary.activeProjects}</strong></div>
              <div><span>Completed Projects</span><strong>{summary.completedProjects}</strong></div>
              <div><span>Total CRs</span><strong>{summary.totalCrs}</strong></div>
              <div><span>Last Activity Date</span><strong>{formatDisplayDateTime(summary.lastActivityDate)}</strong></div>
            </div>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={() => setSummary(null)}>Close</CButton>
        </CModalFooter>
      </CModal>
    </div>
  );
};

export default OrganizationManagementPage;
