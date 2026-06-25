import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CFormSelect,
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
import { getRegressionRun, listRegressionRuns, startRegressionSuite } from '../../services/adminService';
import { formatDisplayDateTime } from '../../utils/dateUtils';

const statusColor = {
  RUNNING: 'info',
  COMPLETED: 'success',
  FAILED: 'danger',
};

const detailColor = {
  PASS: 'success',
  FAIL: 'danger',
};

const formatDuration = (seconds) => {
  const value = Number(seconds || 0);
  const minutes = Math.floor(value / 60);
  const remaining = value % 60;
  return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`;
};

const valueOrDash = (value) => (value === null || value === undefined || value === '' ? '-' : value);

const RegressionSuitePage = () => {
  const userRole = String(authService.getUserRole() || '').toUpperCase();
  const isAuthorized = userRole === 'SUPER_ADMIN';
  const [projectCount, setProjectCount] = useState(10);
  const [runs, setRuns] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [selectedRun, setSelectedRun] = useState(null);
  const [details, setDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const activeRun = useMemo(() => runs.find((run) => String(run.status).toUpperCase() === 'RUNNING'), [runs]);
  const displayedRun = selectedRun || activeRun || runs[0] || null;

  const loadRuns = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await listRegressionRuns({ page: 1, pageSize: 10 });
      setRuns(result.items || []);
      setPagination(result.pagination || { page: 1, pageSize: 10, total: 0 });
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load regression runs');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadRunDetail = useCallback(async (runId, { quiet = false } = {}) => {
    if (!runId) return;
    if (!quiet) setLoading(true);
    try {
      const result = await getRegressionRun(runId);
      setSelectedRun(result.run);
      setDetails(result.details || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load regression run');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthorized) loadRuns();
  }, [isAuthorized, loadRuns]);

  useEffect(() => {
    if (displayedRun?.runId) loadRunDetail(displayedRun.runId, { quiet: true });
  }, [displayedRun?.runId, loadRunDetail]);

  useEffect(() => {
    if (!isAuthorized || !activeRun) return undefined;
    const timer = window.setInterval(() => {
      loadRuns({ quiet: true });
      loadRunDetail(activeRun.runId, { quiet: true });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeRun, isAuthorized, loadRunDetail, loadRuns]);

  const handleRun = async () => {
    setStarting(true);
    setError('');
    setMessage('');
    try {
      const result = await startRegressionSuite(projectCount);
      setMessage(`Regression Suite started. Run #${result.run?.runId}`);
      setSelectedRun(result.run);
      setDetails(result.details || []);
      await loadRuns({ quiet: true });
    } catch (err) {
      setError(err.message || 'Failed to start regression suite');
    } finally {
      setStarting(false);
    }
  };

  if (!isAuthorized) {
    return <CAlert color="danger">Regression suite access requires SUPER_ADMIN role.</CAlert>;
  }

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <h1 className="page-title mb-1">Regression Suite</h1>
          <p className="text-muted mb-0">Generate realistic TEST DATA and validate end-to-end workflows.</p>
        </CCol>
      </CRow>

      {message && <CAlert color="success">{message}</CAlert>}
      {error && <CAlert color="danger">{error}</CAlert>}

      <CCard className="mb-4">
        <CCardHeader><strong>Execution Options</strong></CCardHeader>
        <CCardBody>
          <CRow className="g-3 align-items-end">
            <CCol md={4}>
              <label className="form-label">Number Of Test Projects</label>
              <CFormSelect value={projectCount} onChange={(event) => setProjectCount(Number(event.target.value))} disabled={starting || Boolean(activeRun)}>
                {[5, 10, 25, 50].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol md={8} className="d-flex gap-2">
              <CButton color="primary" onClick={handleRun} disabled={starting || Boolean(activeRun)}>
                {(starting || activeRun) && <CSpinner size="sm" className="me-2" />}
                {activeRun ? 'Regression Running' : 'Run Regression Suite'}
              </CButton>
              <CButton color="secondary" variant="outline" onClick={() => loadRuns()} disabled={loading}>
                View Previous Runs
              </CButton>
            </CCol>
          </CRow>
        </CCardBody>
      </CCard>

      {displayedRun && (
        <CCard className="mb-4">
          <CCardHeader className="d-flex justify-content-between align-items-center">
            <strong>Regression Run #{displayedRun.runId}</strong>
            <CBadge color={statusColor[String(displayedRun.status).toUpperCase()] || 'secondary'}>{displayedRun.status}</CBadge>
          </CCardHeader>
          <CCardBody>
            <CRow className="g-3">
              <CCol md={3}><div className="text-muted small">Projects Created</div><div className="fw-semibold">{displayedRun.projectsCreated}</div></CCol>
              <CCol md={3}><div className="text-muted small">CRs Created</div><div className="fw-semibold">{displayedRun.crsCreated}</div></CCol>
              <CCol md={3}><div className="text-muted small">Snapshots Created</div><div className="fw-semibold">{displayedRun.progressSnapshotsCreated}</div></CCol>
              <CCol md={3}><div className="text-muted small">Completed Projects</div><div className="fw-semibold">{displayedRun.completedProjectsCreated}</div></CCol>
              <CCol md={3}><div className="text-muted small">Forecasts Run</div><div className="fw-semibold">{displayedRun.forecastsRun}</div></CCol>
              <CCol md={3}><div className="text-muted small">Passed Steps</div><div className="fw-semibold">{displayedRun.passedSteps}</div></CCol>
              <CCol md={3}><div className="text-muted small">Failed Steps</div><div className="fw-semibold">{displayedRun.failedSteps}</div></CCol>
              <CCol md={3}><div className="text-muted small">Duration</div><div className="fw-semibold">{formatDuration(displayedRun.durationSeconds)}</div></CCol>
              <CCol xs={12}><div className="text-muted small">Current Stage</div><div className="fw-semibold">{valueOrDash(displayedRun.currentStage)}</div></CCol>
              {displayedRun.errorMessage && <CCol xs={12}><CAlert color="danger" className="mb-0">{displayedRun.errorMessage}</CAlert></CCol>}
            </CRow>
          </CCardBody>
        </CCard>
      )}

      <CRow className="g-4">
        <CCol lg={5}>
          <CCard>
            <CCardHeader><strong>Previous Runs</strong></CCardHeader>
            <CCardBody className="p-0">
              <div className="table-responsive">
                <CTable hover align="middle" className="mb-0">
                  <CTableHead>
                    <CTableRow>
                      <CTableHeaderCell>Run</CTableHeaderCell>
                      <CTableHeaderCell>Status</CTableHeaderCell>
                      <CTableHeaderCell>Projects</CTableHeaderCell>
                      <CTableHeaderCell>Started</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {loading && !runs.length ? (
                      <CTableRow><CTableDataCell colSpan={4} className="text-center py-4"><CSpinner /></CTableDataCell></CTableRow>
                    ) : runs.length ? runs.map((run) => (
                      <CTableRow key={run.runId} role="button" onClick={() => loadRunDetail(run.runId)}>
                        <CTableDataCell>#{run.runId}</CTableDataCell>
                        <CTableDataCell><CBadge color={statusColor[String(run.status).toUpperCase()] || 'secondary'}>{run.status}</CBadge></CTableDataCell>
                        <CTableDataCell>{run.projectsCreated}/{run.requestedProjectCount}</CTableDataCell>
                        <CTableDataCell>{formatDisplayDateTime(run.startedAt)}</CTableDataCell>
                      </CTableRow>
                    )) : (
                      <CTableRow><CTableDataCell colSpan={4} className="text-center text-muted py-4">No regression runs available.</CTableDataCell></CTableRow>
                    )}
                  </CTableBody>
                </CTable>
              </div>
              <div className="small text-muted p-3">Showing {runs.length} of {pagination.total} runs.</div>
            </CCardBody>
          </CCard>
        </CCol>

        <CCol lg={7}>
          <CCard>
            <CCardHeader><strong>Execution Details</strong></CCardHeader>
            <CCardBody className="p-0">
              <div className="table-responsive">
                <CTable hover align="middle" className="mb-0">
                  <CTableHead>
                    <CTableRow>
                      <CTableHeaderCell>Step</CTableHeaderCell>
                      <CTableHeaderCell>Status</CTableHeaderCell>
                      <CTableHeaderCell>Entity</CTableHeaderCell>
                      <CTableHeaderCell>Message</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {details.length ? details.map((detail) => (
                      <CTableRow key={detail.detailId}>
                        <CTableDataCell>{detail.stepName}</CTableDataCell>
                        <CTableDataCell><CBadge color={detailColor[detail.status] || 'secondary'}>{detail.status}</CBadge></CTableDataCell>
                        <CTableDataCell>{detail.entityType ? `${detail.entityType} ${detail.entityId || ''}` : '-'}</CTableDataCell>
                        <CTableDataCell>{detail.errorMessage || detail.message || '-'}</CTableDataCell>
                      </CTableRow>
                    )) : (
                      <CTableRow><CTableDataCell colSpan={4} className="text-center text-muted py-4">Select a run to view execution details.</CTableDataCell></CTableRow>
                    )}
                  </CTableBody>
                </CTable>
              </div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
};

export default RegressionSuitePage;
