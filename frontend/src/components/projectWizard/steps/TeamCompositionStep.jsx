import React from 'react';
import { CRow, CCol, CForm, CFormInput, CFormSelect, CButton } from '@coreui/react';

const roleOptions = ['PM', 'BA', 'Python SSE', 'Manual Tester', 'QA', 'UX', 'Developer'];
const locationOptions = ['Onshore', 'Offshore', 'Hybrid'];

const TeamCompositionStep = ({ data, updateSection, setTeamRows, errors }) => {
  const updateRow = (index, field, value) => {
    const updatedRows = data.rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row
    );
    setTeamRows(updatedRows);
  };

  const addRow = () => {
    setTeamRows([
      ...data.rows,
      {
        role: 'Developer',
        count: 1,
        avgExperience: '',
        location: 'Onshore',
      },
    ]);
  };

  const removeRow = (index) => {
    const updatedRows = data.rows.filter((_, rowIndex) => rowIndex !== index);
    setTeamRows(updatedRows);
  };

  return (
    <div className="wizard-step-panel">
      <h3>Team Composition</h3>
      <div className="team-composition-grid">
        <div className="team-composition-row team-composition-header">
          <div>Role</div>
          <div>Count</div>
          <div>Avg Experience</div>
          <div>Location</div>
          <div /></div>
        {data.rows.map((row, index) => (
          <div key={index} className="team-composition-row">
            <CFormSelect
              value={row.role}
              onChange={(event) => updateRow(index, 'role', event.target.value)}
            >
              {roleOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            <CFormInput
              type="number"
              value={row.count}
              min="1"
              onChange={(event) => updateRow(index, 'count', event.target.value)}
            />
            <CFormInput
              type="number"
              value={row.avgExperience}
              min="0"
              step="0.5"
              onChange={(event) => updateRow(index, 'avgExperience', event.target.value)}
            />
            <CFormSelect
              value={row.location}
              onChange={(event) => updateRow(index, 'location', event.target.value)}
            >
              {locationOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CFormSelect>
            <CButton color="danger" size="sm" onClick={() => removeRow(index)}>
              Remove
            </CButton>
          </div>
        ))}
      </div>
      {errors.teamComposition && <div className="form-error mt-3">{errors.teamComposition}</div>}
      <div className="mb-4 mt-4">
        <CButton color="secondary" onClick={addRow}>Add Role</CButton>
      </div>
      <CForm>
        <CRow>
          <CCol md={6}>
            <label className="form-label">Locations</label>
            <CFormInput
              value={data.locations}
              onChange={(event) => updateSection({ locations: event.target.value })}
            />
          </CCol>
          <CCol md={6}>
            <label className="form-label">Offshore/Onshore Ratio</label>
            <CFormInput
              value={data.offshoreOnshoreRatio}
              onChange={(event) => updateSection({ offshoreOnshoreRatio: event.target.value })}
            />
          </CCol>
        </CRow>
      </CForm>
    </div>
  );
};

export default TeamCompositionStep;
