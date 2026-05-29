import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CAlert, CBadge, CButton, CCol, CFormCheck, CFormInput, CFormSelect, CRow } from '@coreui/react';
import DataTable from '../../components/dataTable/DataTable';
import { createUser, listUsers, updateUser } from '../../services/adminService';
import authService from '../../services/authService';
import { formatDisplayDateTime } from '../../utils/dateUtils';

const emptyForm = {
  userId: null,
  userName: '',
  email: '',
  password: '',
  role: 'PM',
  managerId: '',
  activeFlag: true,
};

const roleOptions = ['ADMIN', 'AM', 'PM'];

const roleLabel = (role) => (role === 'ACCOUNT_MANAGER' ? 'AM' : role);

const UserManagementPage = () => {
  const isAdmin = String(authService.getUserRole() || '').toUpperCase() === 'ADMIN';
  const [users, setUsers] = useState([]);
  const [accountManagers, setAccountManagers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listUsers();
      setUsers(result.items || []);
      setAccountManagers(result.accountManagers || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers]);

  const resetForm = () => {
    setForm(emptyForm);
    setMessage('');
    setError('');
  };

  const editUser = (user) => {
    const role = roleLabel(user.role);
    setForm({
      userId: user.userId,
      userName: user.userName || '',
      email: user.email || '',
      password: '',
      role,
      managerId: role === 'PM' ? user.managerId || '' : '',
      activeFlag: Boolean(user.activeFlag),
    });
    setMessage('');
    setError('');
  };

  const updateForm = (field, value) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'role' && value !== 'PM') {
        next.managerId = '';
      }
      return next;
    });
  };

  const handleSubmit = async (event) => {
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
        managerId: form.role === 'PM' ? form.managerId || null : null,
        activeFlag: form.activeFlag,
      };
      if (form.userId) {
        await updateUser(form.userId, payload);
        setMessage('User updated.');
      } else {
        await createUser(payload);
        setMessage('User created.');
      }
      await loadUsers();
      setForm(emptyForm);
    } catch (err) {
      setError(err.message || 'Unable to save user');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'userName', label: 'User Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', render: (row) => roleLabel(row.role) },
    { key: 'managerName', label: 'Assigned Account Manager', render: (row) => roleLabel(row.role) === 'PM' ? row.managerName || '-' : '-' },
    {
      key: 'activeFlag',
      label: 'Status',
      render: (row) => <CBadge color={row.activeFlag ? 'success' : 'secondary'}>{row.activeFlag ? 'ACTIVE' : 'INACTIVE'}</CBadge>,
    },
    { key: 'updatedAt', label: 'Updated', render: (row) => formatDisplayDateTime(row.updatedAt) },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="d-flex gap-2">
          <CButton color="primary" variant="outline" size="sm" onClick={() => editUser(row)}>Edit</CButton>
          <CButton
            color={row.activeFlag ? 'secondary' : 'success'}
            variant="outline"
            size="sm"
            onClick={() => updateUser(row.userId, {
              userName: row.userName,
              email: row.email,
              role: roleLabel(row.role),
              managerId: roleLabel(row.role) === 'PM' ? row.managerId || null : null,
              activeFlag: !row.activeFlag,
            }).then(loadUsers).catch((err) => setError(err.message || 'Unable to update status'))}
          >
            {row.activeFlag ? 'Deactivate' : 'Activate'}
          </CButton>
        </div>
      ),
    },
  ], [loadUsers]);

  if (!isAdmin) {
    return <CAlert color="danger">Administration access requires ADMIN role.</CAlert>;
  }

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <h1 className="page-title mb-1">Users</h1>
          <p className="text-muted mb-0">Manage users and assign PMs to Account Managers.</p>
        </CCol>
      </CRow>

      {message && <CAlert color="success">{message}</CAlert>}
      {error && <CAlert color="danger">{error}</CAlert>}

      <form className="admin-user-form" onSubmit={handleSubmit}>
        <CRow className="g-3">
          <CCol md={3}>
            <label className="form-label">User Name</label>
            <CFormInput value={form.userName} onChange={(event) => updateForm('userName', event.target.value)} required />
          </CCol>
          <CCol md={3}>
            <label className="form-label">Email</label>
            <CFormInput type="email" value={form.email} onChange={(event) => updateForm('email', event.target.value)} required />
          </CCol>
          <CCol md={2}>
            <label className="form-label">Role</label>
            <CFormSelect value={form.role} onChange={(event) => updateForm('role', event.target.value)}>
              {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
            </CFormSelect>
          </CCol>
          <CCol md={2}>
            <label className="form-label">{form.userId ? 'New Password' : 'Password'}</label>
            <CFormInput type="password" value={form.password} onChange={(event) => updateForm('password', event.target.value)} required={!form.userId} />
          </CCol>
          <CCol md={2} className="d-flex align-items-end">
            <CFormCheck label="Active" checked={form.activeFlag} onChange={(event) => updateForm('activeFlag', event.target.checked)} />
          </CCol>
          {form.role === 'PM' && (
            <CCol md={4}>
              <label className="form-label">Assigned Account Manager</label>
              <CFormSelect value={form.managerId} onChange={(event) => updateForm('managerId', event.target.value)}>
                <option value="">Unassigned</option>
                {accountManagers.map((manager) => (
                  <option key={manager.userId} value={manager.userId}>{manager.userName} ({manager.email})</option>
                ))}
              </CFormSelect>
            </CCol>
          )}
        </CRow>
        <div className="d-flex gap-2 mt-3">
          <CButton color="primary" type="submit" disabled={saving}>{saving ? 'Saving...' : form.userId ? 'Update User' : 'Create User'}</CButton>
          <CButton color="secondary" variant="outline" type="button" onClick={resetForm}>Clear</CButton>
        </div>
      </form>

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
    </div>
  );
};

export default UserManagementPage;
