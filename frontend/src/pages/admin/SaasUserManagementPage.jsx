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
  createAdminUser,
  listAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
} from '../../services/administrationService';
import authService from '../../services/authService';
import { formatDisplayDateTime } from '../../utils/dateUtils';

const emptyForm = {
  userId: null,
  userName: '',
  email: '',
  password: '',
  role: 'PM',
  organizationId: '',
  activeFlag: true,
};

const roleLabel = (role) => (role === 'ACCOUNT_MANAGER' ? 'AM' : role);

const statusBadge = (activeFlag) => (
  <CBadge color={activeFlag ? 'success' : 'secondary'}>{activeFlag ? 'ACTIVE' : 'INACTIVE'}</CBadge>
);

const SaasUserManagementPage = () => {
  const currentUser = authService.getCurrentUser();
  const currentRole = String(currentUser?.role || '').toUpperCase();
  const isSuperAdmin = currentRole === 'SUPER_ADMIN';
  const isTenantAdmin = currentRole === 'ADMIN';
  const canAccess = isSuperAdmin || isTenantAdmin;
  const roleOptions = isSuperAdmin ? ['SUPER_ADMIN', 'ADMIN', 'AM', 'PM'] : ['ADMIN', 'AM', 'PM'];

  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [modalVisible, setModalVisible] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listAdminUsers(isSuperAdmin && selectedOrganizationId ? { organizationId: selectedOrganizationId } : {});
      setUsers(result.items || []);
      setOrganizations(result.organizations || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, selectedOrganizationId]);

  useEffect(() => {
    if (canAccess) loadUsers();
  }, [canAccess, loadUsers]);

  const defaultOrganizationId = useMemo(() => {
    if (isSuperAdmin) return selectedOrganizationId || organizations[0]?.organizationId || '';
    return currentUser?.organizationId || organizations[0]?.organizationId || '';
  }, [currentUser?.organizationId, isSuperAdmin, organizations, selectedOrganizationId]);

  const openCreate = () => {
    setForm({ ...emptyForm, organizationId: defaultOrganizationId });
    setModalVisible(true);
    setTemporaryPassword('');
    setError('');
    setMessage('');
  };

  const openEdit = (user) => {
    setForm({
      userId: user.userId,
      userName: user.userName || '',
      email: user.email || '',
      password: '',
      role: roleLabel(user.role) || 'PM',
      organizationId: user.organizationId || defaultOrganizationId,
      activeFlag: Boolean(user.activeFlag),
    });
    setModalVisible(true);
    setTemporaryPassword('');
    setError('');
    setMessage('');
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveUser = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        userName: form.userName,
        email: form.email,
        password: form.password,
        role: form.role,
        organizationId: form.organizationId,
        activeFlag: form.activeFlag,
      };
      if (form.userId) {
        await updateAdminUser(form.userId, payload);
        setMessage('User updated.');
      } else {
        await createAdminUser(payload);
        setMessage('User created.');
      }
      setModalVisible(false);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Unable to save user');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (user) => {
    setError('');
    setMessage('');
    setTemporaryPassword('');
    try {
      const result = await resetAdminUserPassword(user.userId, { organizationId: user.organizationId });
      setTemporaryPassword(result.temporaryPassword);
      setMessage(`Temporary password generated for ${user.userName}.`);
    } catch (err) {
      setError(err.message || 'Unable to reset password');
    }
  };

  const toggleStatus = async (user) => {
    setError('');
    setMessage('');
    try {
      await updateAdminUser(user.userId, {
        role: roleLabel(user.role),
        activeFlag: !user.activeFlag,
        organizationId: user.organizationId,
      });
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Unable to update status');
    }
  };

  const columns = [
    { key: 'userName', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', render: (row) => roleLabel(row.role) },
    ...(isSuperAdmin ? [{ key: 'organizationName', label: 'Organization', render: (row) => row.organizationName || row.organizationCode || row.organizationId }] : []),
    { key: 'activeFlag', label: 'Status', render: (row) => statusBadge(row.activeFlag) },
    { key: 'lastLoginAt', label: 'Last Login', render: (row) => formatDisplayDateTime(row.lastLoginAt) },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="d-flex gap-2 flex-wrap">
          <CButton color="primary" size="sm" onClick={() => openEdit(row)}>Edit</CButton>
          <CButton color="warning" variant="outline" size="sm" onClick={() => resetPassword(row)}>Reset Password</CButton>
          <CButton color={row.activeFlag ? 'secondary' : 'success'} variant="outline" size="sm" onClick={() => toggleStatus(row)}>
            {row.activeFlag ? 'Deactivate' : 'Activate'}
          </CButton>
        </div>
      ),
    },
  ];

  if (!canAccess) {
    return <CAlert color="danger">Administration access requires SUPER_ADMIN or ADMIN role.</CAlert>;
  }

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12} className="d-flex justify-content-between align-items-start gap-3">
          <div>
            <h1 className="page-title mb-1">Users</h1>
            <p className="text-muted mb-0">Create users, assign roles and tenants, reset passwords, and deactivate access.</p>
          </div>
          <CButton color="primary" onClick={openCreate}>Create User</CButton>
        </CCol>
      </CRow>

      {isSuperAdmin && (
        <CRow className="mb-3">
          <CCol md={4}>
            <label className="form-label">Organization Filter</label>
            <CFormSelect value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)}>
              <option value="">All organizations</option>
              {organizations.map((organization) => (
                <option key={organization.organizationId} value={organization.organizationId}>
                  {organization.organizationName} ({organization.organizationCode})
                </option>
              ))}
            </CFormSelect>
          </CCol>
        </CRow>
      )}

      {message && <CAlert color="success">{message}</CAlert>}
      {temporaryPassword && (
        <CAlert color="warning">
          Temporary Password: <strong>{temporaryPassword}</strong>
        </CAlert>
      )}
      {error && <CAlert color="danger">{error}</CAlert>}

      <DataTable
        columns={columns}
        rows={users}
        loading={loading}
        error=""
        page={1}
        pageSize={users.length || 10}
        totalRecords={users.length}
        totalPages={1}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        emptyMessage="No users configured."
      />

      <CModal visible={modalVisible} onClose={() => setModalVisible(false)} backdrop="static">
        <form onSubmit={saveUser}>
          <CModalHeader>
            <CModalTitle>{form.userId ? 'Edit User' : 'Create User'}</CModalTitle>
          </CModalHeader>
          <CModalBody>
            <CRow className="g-3">
              {!form.userId && (
                <>
                  <CCol xs={12}>
                    <label className="form-label">Name</label>
                    <CFormInput value={form.userName} onChange={(event) => updateForm('userName', event.target.value)} required />
                  </CCol>
                  <CCol xs={12}>
                    <label className="form-label">Email</label>
                    <CFormInput type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} required />
                  </CCol>
                  <CCol xs={12}>
                    <label className="form-label">Password</label>
                    <CFormInput type="password" value={form.password} onChange={(event) => updateForm('password', event.target.value)} required />
                  </CCol>
                  <CCol xs={12}>
                    <label className="form-label">Organization</label>
                    <CFormSelect
                      value={form.organizationId}
                      onChange={(event) => updateForm('organizationId', event.target.value)}
                      disabled={!isSuperAdmin}
                      required
                    >
                      <option value="">Select organization</option>
                      {organizations.map((organization) => (
                        <option key={organization.organizationId} value={organization.organizationId}>
                          {organization.organizationName} ({organization.organizationCode})
                        </option>
                      ))}
                    </CFormSelect>
                  </CCol>
                </>
              )}
              {form.userId && (
                <CCol xs={12}>
                  <div className="text-muted">{form.userName} ({form.email})</div>
                </CCol>
              )}
              <CCol xs={12}>
                <label className="form-label">Role</label>
                <CFormSelect value={form.role} onChange={(event) => updateForm('role', event.target.value)}>
                  {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                </CFormSelect>
              </CCol>
              <CCol xs={12}>
                <label className="form-label">Status</label>
                <CFormSelect value={form.activeFlag ? 'ACTIVE' : 'INACTIVE'} onChange={(event) => updateForm('activeFlag', event.target.value === 'ACTIVE')}>
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
    </div>
  );
};

export default SaasUserManagementPage;
