import React from 'react';
import { CCol, CFormInput, CFormSelect, CFormTextarea, CRow } from '@coreui/react';

const categoryOptions = ['', 'Scope', 'Schedule', 'Cost', 'Quality', 'Risk', 'Compliance'];
const severityOptions = ['', 'Low', 'Medium', 'High', 'Critical'];
const priorityOptions = ['', 'Low', 'Medium', 'High', 'Urgent'];

const CRBasicInfoStep = ({ data, projects, updateSection, errors, readOnlyProject }) => (
  <div className="wizard-step-panel">
    <h3>CR Basic Information</h3>
    <CRow className="g-3">
      <CCol md={6}>
        <label className="form-label">Project</label>
        <CFormSelect
          value={data.projectId || ''}
          onChange={(event) => updateSection({ projectId: event.target.value })}
          disabled={readOnlyProject}
          invalid={!!errors.projectId}
        >
          <option value="">Select project</option>
          {projects.map((project) => (
            <option key={project.projectId} value={project.projectId}>
              {project.projectCode ? `${project.projectCode} - ` : ''}{project.projectName}
            </option>
          ))}
        </CFormSelect>
        {errors.projectId && <div className="form-error">{errors.projectId}</div>}
      </CCol>
      <CCol md={6}>
        <label className="form-label">Affected Module</label>
        <CFormInput
          value={data.affectedModule}
          onChange={(event) => updateSection({ affectedModule: event.target.value })}
          invalid={!!errors.affectedModule}
        />
        {errors.affectedModule && <div className="form-error">{errors.affectedModule}</div>}
      </CCol>
      <CCol md={12}>
        <label className="form-label">CR Title</label>
        <CFormInput
          value={data.title}
          onChange={(event) => updateSection({ title: event.target.value })}
          invalid={!!errors.title}
        />
        {errors.title && <div className="form-error">{errors.title}</div>}
      </CCol>
      <CCol md={12}>
        <label className="form-label">CR Description</label>
        <CFormTextarea
          rows={4}
          value={data.description}
          onChange={(event) => updateSection({ description: event.target.value })}
          invalid={!!errors.description}
        />
        {errors.description && <div className="form-error">{errors.description}</div>}
      </CCol>
      <CCol md={4}>
        <label className="form-label">Category</label>
        <CFormSelect value={data.category} onChange={(event) => updateSection({ category: event.target.value })} invalid={!!errors.category}>
          {categoryOptions.map((value) => <option key={value} value={value}>{value || 'Select category'}</option>)}
        </CFormSelect>
        {errors.category && <div className="form-error">{errors.category}</div>}
      </CCol>
      <CCol md={4}>
        <label className="form-label">Severity</label>
        <CFormSelect value={data.severity} onChange={(event) => updateSection({ severity: event.target.value })} invalid={!!errors.severity}>
          {severityOptions.map((value) => <option key={value} value={value}>{value || 'Select severity'}</option>)}
        </CFormSelect>
        {errors.severity && <div className="form-error">{errors.severity}</div>}
      </CCol>
      <CCol md={4}>
        <label className="form-label">Priority</label>
        <CFormSelect value={data.priority} onChange={(event) => updateSection({ priority: event.target.value })} invalid={!!errors.priority}>
          {priorityOptions.map((value) => <option key={value} value={value}>{value || 'Select priority'}</option>)}
        </CFormSelect>
        {errors.priority && <div className="form-error">{errors.priority}</div>}
      </CCol>
    </CRow>
  </div>
);

export default CRBasicInfoStep;
