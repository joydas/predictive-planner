import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react';
import authService from '../../services/authService';
import { getMlAdministration, retrainMlModels } from '../../services/adminService';
import { formatDisplayDateTime } from '../../utils/dateUtils';

const statusColor = {
  IDLE: 'secondary',
  RUNNING: 'info',
  SUCCESS: 'success',
  FAILED: 'danger',
};

const valueOrDash = (value) => (value === null || value === undefined || value === '' ? '-' : value);

const MlAdministrationPage = () => {
  const isAdmin = String(authService.getUserRole() || '').toUpperCase() === 'ADMIN';
  const [modelInfo, setModelInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const status = String(modelInfo?.trainingStatus || 'IDLE').toUpperCase();
  const isRunning = status === 'RUNNING';
  const logs = useMemo(() => modelInfo?.logs || [], [modelInfo]);
  const history = modelInfo?.history || [];

  const loadModelInfo = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await getMlAdministration();
      setModelInfo(result);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load ML administration status');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadModelInfo();
  }, [isAdmin, loadModelInfo]);

  useEffect(() => {
    if (!isAdmin || !isRunning) return undefined;
    const timer = window.setInterval(() => {
      loadModelInfo({ quiet: true });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [isAdmin, isRunning, loadModelInfo]);

  const handleRetrain = async () => {
    setStarting(true);
    setError('');
    setMessage('');
    try {
      const result = await retrainMlModels();
      setMessage(result.accepted === false ? 'Training is already running.' : `Training started. Job: ${result.jobId}`);
      await loadModelInfo({ quiet: true });
    } catch (err) {
      setError(err.message || 'Failed to start retraining');
    } finally {
      setStarting(false);
    }
  };

  if (!isAdmin) {
    return <CAlert color="danger">Administration access requires ADMIN role.</CAlert>;
  }

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <h1 className="page-title mb-1">ML Administration</h1>
          <p className="text-muted mb-0">Monitor model status and retrain prediction models.</p>
        </CCol>
      </CRow>

      {message && <CAlert color="success">{message}</CAlert>}
      {error && <CAlert color="danger">{error}</CAlert>}

      <CCard className="mb-4">
        <CCardHeader className="d-flex justify-content-between align-items-center">
          <strong>Model Information</strong>
          <CButton color="primary" onClick={handleRetrain} disabled={loading || starting || isRunning}>
            {(starting || isRunning) && <CSpinner size="sm" className="me-2" />}
            {isRunning ? 'Training Running' : 'Retrain Model'}
          </CButton>
        </CCardHeader>
        <CCardBody>
          {loading ? (
            <div className="text-center py-4"><CSpinner /></div>
          ) : (
            <CRow className="g-3">
              <CCol md={4}>
                <div className="text-muted small">Current Model Version</div>
                <div className="fw-semibold">{valueOrDash(modelInfo?.modelVersion)}</div>
              </CCol>
              <CCol md={4}>
                <div className="text-muted small">Last Training Date/Time</div>
                <div className="fw-semibold">{formatDisplayDateTime(modelInfo?.lastTrainingAt)}</div>
              </CCol>
              <CCol md={4}>
                <div className="text-muted small">Training Status</div>
                <CBadge color={statusColor[status] || 'secondary'}>{status}</CBadge>
              </CCol>
              <CCol md={4}>
                <div className="text-muted small">Projects Used</div>
                <div className="fw-semibold">{valueOrDash(modelInfo?.projectsUsed)}</div>
              </CCol>
              <CCol md={4}>
                <div className="text-muted small">Training Records/Snapshots Used</div>
                <div className="fw-semibold">{valueOrDash(modelInfo?.recordsUsed)}</div>
              </CCol>
              <CCol md={4}>
                <div className="text-muted small">Running Job</div>
                <div className="fw-semibold">{valueOrDash(modelInfo?.runningJobId)}</div>
              </CCol>
            </CRow>
          )}
        </CCardBody>
      </CCard>

      <CCard className="mb-4">
        <CCardHeader><strong>Training Output</strong></CCardHeader>
        <CCardBody>
          <div className="bg-dark text-light p-3 rounded" style={{ minHeight: 180, maxHeight: 320, overflowY: 'auto', fontFamily: 'monospace', fontSize: 13 }}>
            {logs.length ? logs.map((line, index) => <div key={`${line}-${index}`}>{line}</div>) : <div className="text-secondary">No active training output.</div>}
          </div>
        </CCardBody>
      </CCard>

      <CCard>
        <CCardHeader><strong>Training History</strong></CCardHeader>
        <CCardBody className="p-0">
          <div className="table-responsive">
            <CTable hover align="middle" className="mb-0">
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Model Version</CTableHeaderCell>
                  <CTableHeaderCell>Started</CTableHeaderCell>
                  <CTableHeaderCell>Ended</CTableHeaderCell>
                  <CTableHeaderCell>Status</CTableHeaderCell>
                  <CTableHeaderCell>Records Used</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {history.length ? history.map((item) => (
                  <CTableRow key={item.jobId}>
                    <CTableDataCell>{valueOrDash(item.modelVersion)}</CTableDataCell>
                    <CTableDataCell>{formatDisplayDateTime(item.startedAt)}</CTableDataCell>
                    <CTableDataCell>{formatDisplayDateTime(item.endedAt)}</CTableDataCell>
                    <CTableDataCell><CBadge color={statusColor[item.status] || 'secondary'}>{item.status}</CBadge></CTableDataCell>
                    <CTableDataCell>{valueOrDash(item.recordsUsed)}</CTableDataCell>
                  </CTableRow>
                )) : (
                  <CTableRow>
                    <CTableDataCell colSpan={5} className="text-center text-muted py-4">No training history available.</CTableDataCell>
                  </CTableRow>
                )}
              </CTableBody>
            </CTable>
          </div>
        </CCardBody>
      </CCard>
    </div>
  );
};

export default MlAdministrationPage;
