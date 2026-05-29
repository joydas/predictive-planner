import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CAlert,
  CBadge,
  CButton,
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CFormInput,
  CFormTextarea,
  CRow,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react';
import { useNavigate, useParams } from 'react-router-dom';
import DateDisplayInput from '../components/projectWizard/DateDisplayInput';
import { formatApiDate, formatDisplayDate, formatDisplayDateTime } from '../utils/dateUtils';
import { formatCurrency, parseNumber } from '../utils/resourcePlanning';
import { getProjectProgress, saveProjectProgress } from '../services/projectService';

const severityColors = {
  'Not Measured': 'secondary',
  Normal: 'success',
  Medium: 'warning',
  High: 'danger',
  Urgent: 'dark',
};

const formatNumber = (value) => parseNumber(value, 0).toFixed(2);
const variance = (actual, planned) => parseNumber(actual, 0) - parseNumber(planned, 0);

const severityFromVariance = (expected, actual) => {
  const diff = Math.abs(parseNumber(expected, 0) - parseNumber(actual, 0));
  if (diff <= 10) return 'Normal';
  if (diff <= 20) return 'Medium';
  if (diff <= 40) return 'High';
  return 'Urgent';
};

const ProjectProgress = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [context, setContext] = useState(null);
  const [formData, setFormData] = useState({
    snapshotDate: formatApiDate(new Date()),
    actualEffortPd: '',
    actualBudget: '',
    actualTeamSize: '',
    actualCompletionPercent: '',
    remarks: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadProgress = useCallback(async (snapshotDate = '') => {
    const result = await getProjectProgress(projectId, snapshotDate);
    setContext(result);
    if (result.selectedSnapshot) {
      setFormData({
        snapshotDate: result.selectedSnapshot.snapshotDate || snapshotDate,
        actualEffortPd: result.selectedSnapshot.actualEffortPd ?? '',
        actualBudget: result.selectedSnapshot.actualBudget ?? '',
        actualTeamSize: result.selectedSnapshot.actualTeamSize ?? '',
        actualCompletionPercent: result.selectedSnapshot.actualCompletionPercent ?? '',
        remarks: result.selectedSnapshot.remarks || '',
      });
    }
    return result;
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadProgress()
      .then(() => {
        if (active) setError('');
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load progress screen');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadProgress]);

  const current = useMemo(() => context?.currentApprovedValues || {}, [context]);

  const previewRows = useMemo(() => {
    const expectedCompletion = (() => {
      const start = current.startDate ? new Date(`${current.startDate}T00:00:00`) : null;
      const snap = formData.snapshotDate ? new Date(`${formData.snapshotDate}T00:00:00`) : null;
      const plannedDuration = parseNumber(current.plannedDuration, 0);
      if (!start || !snap || plannedDuration <= 0 || Number.isNaN(start.getTime()) || Number.isNaN(snap.getTime())) return 0;
      return Math.max(0, Math.min(100, (((snap - start) / 86400000) + 1) / plannedDuration * 100));
    })();
    return [
      { metric: 'Effort (PD)', planned: current.plannedEffortPd, actual: formData.actualEffortPd, variance: variance(formData.actualEffortPd, current.plannedEffortPd) },
      { metric: 'Budget', planned: current.plannedBudget, actual: formData.actualBudget, variance: variance(formData.actualBudget, current.plannedBudget), currency: true },
      { metric: 'Team Size', planned: current.plannedTeamSize, actual: formData.actualTeamSize, variance: variance(formData.actualTeamSize, current.plannedTeamSize) },
      { metric: 'Completion %', planned: expectedCompletion, actual: formData.actualCompletionPercent, variance: variance(formData.actualCompletionPercent, expectedCompletion), percent: true },
    ];
  }, [current, formData]);

  const previewSeverity = severityFromVariance(previewRows[3]?.planned, formData.actualCompletionPercent);

  const updateForm = (field, value) => {
    setFormData((currentForm) => ({ ...currentForm, [field]: value }));
    setMessage('');
  };

  const handleDateChange = async (value) => {
    updateForm('snapshotDate', value);
    if (!value) return;
    try {
      const result = await getProjectProgress(projectId, value);
      if (result.selectedSnapshot) {
        setContext(result);
        setFormData({
          snapshotDate: result.selectedSnapshot.snapshotDate,
          actualEffortPd: result.selectedSnapshot.actualEffortPd ?? '',
          actualBudget: result.selectedSnapshot.actualBudget ?? '',
          actualTeamSize: result.selectedSnapshot.actualTeamSize ?? '',
          actualCompletionPercent: result.selectedSnapshot.actualCompletionPercent ?? '',
          remarks: result.selectedSnapshot.remarks || '',
        });
        setMessage('Existing snapshot loaded for this date. Saving will update it.');
      }
    } catch (err) {
      setError(err.message || 'Unable to check snapshot date');
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await saveProjectProgress(projectId, formData);
      setContext(result);
      setMessage('Progress snapshot saved.');
    } catch (err) {
      setError(err.message || 'Unable to save progress snapshot');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="project-wizard-loading"><CSpinner /> Loading progress...</div>;
  }

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <div className="d-flex align-items-center mb-3">
            <CButton color="secondary" variant="outline" onClick={() => navigate('/projects')} className="me-3 smaller-button">
              Back to Projects
            </CButton>
            <h1 className="page-title mb-0">Progress Tracking</h1>
          </div>
          <p className="text-muted mb-0">{context?.project?.projectCode} - {context?.project?.projectName}</p>
        </CCol>
      </CRow>

      {message && <CAlert color="success">{message}</CAlert>}
      {error && <CAlert color="danger">{error}</CAlert>}

      <CCard className="mb-4">
        <CCardHeader><strong>Current Approved Values</strong></CCardHeader>
        <CCardBody>
          <CRow className="g-3">
            <CCol md={2}><div className="text-muted small">Planned Effort (PD)</div><div className="fw-semibold">{formatNumber(current.plannedEffortPd)}</div></CCol>
            <CCol md={2}><div className="text-muted small">Planned Budget</div><div className="fw-semibold">{formatCurrency(current.plannedBudget)}</div></CCol>
            <CCol md={2}><div className="text-muted small">Planned Team Size</div><div className="fw-semibold">{formatNumber(current.plannedTeamSize)}</div></CCol>
            <CCol md={2}><div className="text-muted small">Planned Duration</div><div className="fw-semibold">{formatNumber(current.plannedDuration)} days</div></CCol>
            <CCol md={2}><div className="text-muted small">Current Estimation</div><div className="fw-semibold">{formatNumber(current.currentEstimation)} PD</div></CCol>
            <CCol md={2}><div className="text-muted small">Latest Severity</div><CBadge color={severityColors[context?.latestSnapshot?.severity || 'Not Measured']}>{context?.latestSnapshot?.severity || 'Not Measured'}</CBadge></CCol>
          </CRow>
        </CCardBody>
      </CCard>

      <CRow>
        <CCol lg={5}>
          <CCard className="mb-4">
            <CCardHeader><strong>Progress Snapshot</strong></CCardHeader>
            <CCardBody>
              <CRow className="g-3">
                <CCol xs={12}>
                  <label className="form-label">Snapshot Date</label>
                  <DateDisplayInput value={formData.snapshotDate} onChange={handleDateChange} />
                </CCol>
                <CCol md={6}>
                  <label className="form-label">Actual Effort (PD)</label>
                  <CFormInput type="number" min="0" step="0.01" value={formData.actualEffortPd} onChange={(event) => updateForm('actualEffortPd', event.target.value)} />
                </CCol>
                <CCol md={6}>
                  <label className="form-label">Actual Budget</label>
                  <CFormInput type="number" min="0" step="0.01" value={formData.actualBudget} onChange={(event) => updateForm('actualBudget', event.target.value)} />
                </CCol>
                <CCol md={6}>
                  <label className="form-label">Actual Team Size</label>
                  <CFormInput type="number" min="0" step="0.01" value={formData.actualTeamSize} onChange={(event) => updateForm('actualTeamSize', event.target.value)} />
                </CCol>
                <CCol md={6}>
                  <label className="form-label">Actual Completion %</label>
                  <CFormInput type="number" min="0" max="100" step="0.01" value={formData.actualCompletionPercent} onChange={(event) => updateForm('actualCompletionPercent', event.target.value)} />
                </CCol>
                <CCol xs={12}>
                  <label className="form-label">Remarks</label>
                  <CFormTextarea rows={3} value={formData.remarks} onChange={(event) => updateForm('remarks', event.target.value)} />
                </CCol>
              </CRow>
              <div className="d-flex gap-2 mt-3">
                <CButton color="primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Save Progress'}</CButton>
                <CButton color="secondary" variant="outline" onClick={() => navigate('/projects')}>Cancel</CButton>
              </div>
            </CCardBody>
          </CCard>
        </CCol>

        <CCol lg={7}>
          <CCard className="mb-4">
            <CCardHeader className="d-flex justify-content-between align-items-center">
              <strong>Progress Impact Preview</strong>
              <CBadge color={severityColors[previewSeverity]}>{previewSeverity}</CBadge>
            </CCardHeader>
            <CCardBody className="p-0">
              <CTable hover className="mb-0">
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell>Metric</CTableHeaderCell>
                    <CTableHeaderCell>Current Planned</CTableHeaderCell>
                    <CTableHeaderCell>Actual Reported</CTableHeaderCell>
                    <CTableHeaderCell>Variance</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {previewRows.map((row) => (
                    <CTableRow key={row.metric}>
                      <CTableDataCell>{row.metric}</CTableDataCell>
                      <CTableDataCell>{row.currency ? formatCurrency(row.planned) : `${formatNumber(row.planned)}${row.percent ? '%' : ''}`}</CTableDataCell>
                      <CTableDataCell>{row.currency ? formatCurrency(row.actual) : `${formatNumber(row.actual)}${row.percent ? '%' : ''}`}</CTableDataCell>
                      <CTableDataCell>{row.currency ? formatCurrency(row.variance) : `${formatNumber(row.variance)}${row.percent ? '%' : ''}`}</CTableDataCell>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </CCardBody>
          </CCard>

          <CCard>
            <CCardHeader><strong>Snapshot History</strong></CCardHeader>
            <CCardBody className="p-0">
              <CTable hover className="mb-0">
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell>Date</CTableHeaderCell>
                    <CTableHeaderCell>Effort</CTableHeaderCell>
                    <CTableHeaderCell>Budget</CTableHeaderCell>
                    <CTableHeaderCell>Completion</CTableHeaderCell>
                    <CTableHeaderCell>Severity</CTableHeaderCell>
                    <CTableHeaderCell>Updated</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {(context?.snapshots || []).map((snapshot) => (
                    <CTableRow key={snapshot.snapshotId}>
                      <CTableDataCell>{formatDisplayDate(snapshot.snapshotDate)}</CTableDataCell>
                      <CTableDataCell>{formatNumber(snapshot.actualEffortPd)}</CTableDataCell>
                      <CTableDataCell>{formatCurrency(snapshot.actualBudget)}</CTableDataCell>
                      <CTableDataCell>{formatNumber(snapshot.actualCompletionPercent)}%</CTableDataCell>
                      <CTableDataCell><CBadge color={severityColors[snapshot.severity]}>{snapshot.severity}</CBadge></CTableDataCell>
                      <CTableDataCell>{formatDisplayDateTime(snapshot.updatedAt)}</CTableDataCell>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
};

export default ProjectProgress;
