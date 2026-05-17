import React, { useEffect, useMemo, useState } from 'react';
import {
  CAlert,
  CButton,
  CCard,
  CCardBody,
  CCol,
  CFormInput,
  CFormSelect,
  CFormTextarea,
  CRow,
  CSpinner,
} from '@coreui/react';
import { useNavigate, useParams } from 'react-router-dom';
import { completeProject, getProject } from '../../services/projectService';
import { getPlanningMasterData } from '../../services/masterDataService';
import { formatCurrency, getRateForRole, parseNumber } from '../../utils/resourcePlanning';
import '../../styles/projectWizard.css';

const blankRow = {
  roleId: '',
  role: '',
  location: 'OFFSHORE',
  count: 1,
  rate: '',
  effort: '',
};

const locationOptions = ['ONSITE', 'OFFSHORE'];
const volatilityOptions = ['Low', 'Medium', 'High'];
const riskIndicatorOptions = [
  'Low overall risk',
  'Medium delivery risk',
  'High dependency risk',
  'High requirement risk',
  'High technical risk',
  'Critical multi-factor risk',
];

const metricValue = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  return value === null || value === undefined ? '' : String(value);
};

const optionsWithBaseline = (options, baselineValue) => {
  const normalizedBaseline = metricValue(baselineValue).trim();
  if (!normalizedBaseline || options.includes(normalizedBaseline)) return options;
  return [normalizedBaseline, ...options];
};

const CompleteProjectPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [masterData, setMasterData] = useState({ roles: [], rateCards: [] });
  const [rows, setRows] = useState([{ ...blankRow }]);
  const [actuals, setActuals] = useState({ managementCost: '', contingencyCost: '' });
  const [metrics, setMetrics] = useState({
    dependencyCount: '',
    requirementStabilityIndex: '',
    actualCrVolatility: '',
    riskLevelIndicators: '',
  });
  const [comment, setComment] = useState('Project completed');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getProject(projectId), getPlanningMasterData()])
      .then(([projectResult, masterResult]) => {
        if (!active) return;
        const loadedProject = projectResult.project;
        const baselineRisks = loadedProject?.draftData?.risks || {};
        setProject(loadedProject);
        setMasterData(masterResult || { roles: [], rateCards: [] });
        setMetrics({
          dependencyCount: metricValue(baselineRisks.dependency_count),
          requirementStabilityIndex: metricValue(baselineRisks.requirement_stability_index),
          actualCrVolatility: metricValue(baselineRisks.expected_cr_volatility),
          riskLevelIndicators: metricValue(baselineRisks.risk_level_indicators),
        });
        const approvedRows = loadedProject?.draftData?.teamComposition?.rows || [];
        if (approvedRows.length) {
          setRows(approvedRows.map((row) => ({
            roleId: row.roleId || '',
            role: row.role || '',
            location: row.location || row.locationType || 'OFFSHORE',
            count: row.count || 1,
            rate: row.ratePerDay || '',
            effort: row.plannedEffort && row.count
              ? Number((parseNumber(row.plannedEffort, 0) / parseNumber(row.count, 1)).toFixed(2))
              : '',
          })));
        }
        setError('');
      })
      .catch((err) => setError(err.message || 'Unable to load project completion form'))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  const totals = useMemo(() => {
    const resourceCost = rows.reduce((sum, row) => (
      sum + parseNumber(row.count, 0) * parseNumber(row.rate, 0) * parseNumber(row.effort, 0)
    ), 0);
    const managementCost = parseNumber(actuals.managementCost, 0);
    const contingencyCost = parseNumber(actuals.contingencyCost, 0);
    return {
      resourceCost,
      managementCost,
      contingencyCost,
      fullProjectCost: resourceCost + managementCost + contingencyCost,
    };
  }, [actuals, rows]);

  const updateRow = (index, field, value) => {
    setRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, [field]: value };
      if (field === 'roleId') {
        const selectedRole = masterData.roles.find((role) => String(role.roleId) === String(value));
        next.role = selectedRole?.roleName || '';
        next.rate = getRateForRole(value, next.location, masterData.rateCards);
      }
      if (field === 'location') {
        next.rate = getRateForRole(next.roleId, value, masterData.rateCards) || next.rate;
      }
      return next;
    }));
  };

  const addRow = () => setRows((current) => [...current, { ...blankRow }]);
  const removeRow = (index) => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      await completeProject(projectId, {
        resourceLoading: rows,
        actuals,
        groundMetrics: metrics,
        comment,
      });
      navigate(`/projects/view/${projectId}`);
    } catch (err) {
      setError(err.message || 'Unable to complete project');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="project-wizard-loading"><CSpinner /> Loading project completion...</div>;
  }

  const status = String(project?.workflowStatus || project?.status || '').toUpperCase();
  const baselineRisks = project?.draftData?.risks || {};
  const completionVolatilityOptions = optionsWithBaseline(volatilityOptions, baselineRisks.expected_cr_volatility);
  const completionRiskIndicatorOptions = optionsWithBaseline(riskIndicatorOptions, baselineRisks.risk_level_indicators);

  return (
    <div className="project-wizard-page">
      <div className="project-wizard-header">
        <h1>Complete Project</h1>
        <p>{project?.name || project?.projectName || 'Project'}</p>
      </div>
      {error && <CAlert color="danger">{error}</CAlert>}
      {status !== 'APPROVED' && (
        <CAlert color="warning">Only approved projects can be completed. Current status is {status || 'UNKNOWN'}.</CAlert>
      )}
      <CCard className="project-wizard-card">
        <CCardBody>
          <div className="wizard-step-panel">
            <h3>Final Resource Loading</h3>
            <div className="completion-resource-grid">
              <div className="completion-resource-row completion-resource-header">
                <div>Role</div>
                <div>Location</div>
                <div>Count</div>
                <div>Rate</div>
                <div>Effort</div>
                <div>Cost</div>
                <div />
              </div>
              {rows.map((row, index) => {
                const rowCost = parseNumber(row.count, 0) * parseNumber(row.rate, 0) * parseNumber(row.effort, 0);
                return (
                  <div key={index} className="completion-resource-row">
                    <CFormSelect value={row.roleId} onChange={(event) => updateRow(index, 'roleId', event.target.value)}>
                      <option value="">Select role</option>
                      {masterData.roles.map((role) => (
                        <option key={role.roleId} value={role.roleId}>{role.roleName}</option>
                      ))}
                    </CFormSelect>
                    <CFormSelect value={row.location} onChange={(event) => updateRow(index, 'location', event.target.value)}>
                      {locationOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </CFormSelect>
                    <CFormInput type="number" min="0" step="0.01" value={row.count} onChange={(event) => updateRow(index, 'count', event.target.value)} />
                    <CFormInput type="number" min="0" step="0.01" value={row.rate} onChange={(event) => updateRow(index, 'rate', event.target.value)} />
                    <CFormInput type="number" min="0" step="0.01" value={row.effort} onChange={(event) => updateRow(index, 'effort', event.target.value)} />
                    <div className="derived-cell">{formatCurrency(rowCost)}</div>
                    <CButton color="danger" variant="outline" size="sm" onClick={() => removeRow(index)} disabled={rows.length === 1}>
                      Remove
                    </CButton>
                  </div>
                );
              })}
            </div>
            <div className="mt-3">
              <CButton color="secondary" variant="outline" onClick={addRow}>Add Role</CButton>
            </div>

            <h3 className="mt-4">Actual Costs</h3>
            <CRow className="mb-4">
              <CCol md={6}>
                <label className="form-label">Management Cost Spent</label>
                <CFormInput type="number" min="0" step="0.01" value={actuals.managementCost} onChange={(event) => setActuals((current) => ({ ...current, managementCost: event.target.value }))} />
              </CCol>
              <CCol md={6}>
                <label className="form-label">Contingency Cost Spent</label>
                <CFormInput type="number" min="0" step="0.01" value={actuals.contingencyCost} onChange={(event) => setActuals((current) => ({ ...current, contingencyCost: event.target.value }))} />
              </CCol>
            </CRow>

            <h3>Ground Situation Metrics</h3>
            <CRow className="mb-4">
              <CCol md={3}>
                <label className="form-label">Dependency Count</label>
                <CFormInput type="number" min="0" step="1" value={metrics.dependencyCount} onChange={(event) => setMetrics((current) => ({ ...current, dependencyCount: event.target.value }))} />
              </CCol>
              <CCol md={3}>
                <label className="form-label">Requirement Stability Index</label>
                <CFormInput type="number" min="0" step="0.01" value={metrics.requirementStabilityIndex} onChange={(event) => setMetrics((current) => ({ ...current, requirementStabilityIndex: event.target.value }))} />
              </CCol>
              <CCol md={3}>
                <label className="form-label">Actual CR Volatility</label>
                <CFormSelect value={metrics.actualCrVolatility} onChange={(event) => setMetrics((current) => ({ ...current, actualCrVolatility: event.target.value }))}>
                  <option value="">Select volatility</option>
                  {completionVolatilityOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </CFormSelect>
              </CCol>
              <CCol md={3}>
                <label className="form-label">Risk Level Indicators</label>
                <CFormSelect value={metrics.riskLevelIndicators} onChange={(event) => setMetrics((current) => ({ ...current, riskLevelIndicators: event.target.value }))}>
                  <option value="">Select risk indicator</option>
                  {completionRiskIndicatorOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </CFormSelect>
              </CCol>
            </CRow>

            <div className="derived-summary-grid">
              <div><strong>Resource cost</strong><span>{formatCurrency(totals.resourceCost)}</span></div>
              <div><strong>Management cost</strong><span>{formatCurrency(totals.managementCost)}</span></div>
              <div><strong>Contingency cost</strong><span>{formatCurrency(totals.contingencyCost)}</span></div>
              <div><strong>Full project cost</strong><span>{formatCurrency(totals.fullProjectCost)}</span></div>
            </div>

            <div className="mt-4">
              <label className="form-label">Completion Comment</label>
              <CFormTextarea rows={2} value={comment} onChange={(event) => setComment(event.target.value)} />
            </div>

            <div className="wizard-actions mt-4">
              <CButton color="secondary" variant="outline" onClick={() => navigate('/projects')}>Cancel</CButton>
              <CButton color="success" onClick={handleSubmit} disabled={saving || status !== 'APPROVED'}>
                {saving ? 'Completing...' : 'Submit Completion'}
              </CButton>
            </div>
          </div>
        </CCardBody>
      </CCard>
    </div>
  );
};

export default CompleteProjectPage;
