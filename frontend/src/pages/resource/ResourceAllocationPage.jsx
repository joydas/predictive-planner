import React, { useEffect, useState } from 'react';
import {
  CAlert,
  CButton,
  CCard,
  CCardBody,
  CCol,
  CFormInput,
  CFormLabel,
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
import { listProjects } from '../../services/projectService';
import { listResources, createAllocation, listAllocations } from '../../services/resourceService';
import { getPlanningMasterData } from '../../services/masterDataService';

const ResourceAllocationPage = () => {
  const [projects, setProjects] = useState([]);
  const [resources, setResources] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [allocationPercent, setAllocationPercent] = useState('100');
  const [allocationStartDate, setAllocationStartDate] = useState('');
  const [allocationEndDate, setAllocationEndDate] = useState('');
  const [allocations, setAllocations] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadMasterData = async () => {
    try {
      const data = await getPlanningMasterData();
      setRoles(data.roles || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadProjects = async () => {
    try {
      const data = await listProjects({ status: 'APPROVED', pageSize: 50 });
      setProjects(data.items || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadResources = async () => {
    try {
      const data = await listResources({});
      setResources(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAllocations = async (projectId) => {
    try {
      const items = await listAllocations({ projectId });
      setAllocations(items);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      await Promise.all([loadMasterData(), loadProjects(), loadResources()]);
      setLoading(false);
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadAllocations(selectedProjectId);
    } else {
      setAllocations([]);
    }
  }, [selectedProjectId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!selectedProjectId || !selectedResourceId || !selectedRoleId) {
      setError('Project, resource, and role are required.');
      return;
    }

    try {
      await createAllocation({
        projectId: Number(selectedProjectId),
        resourceId: Number(selectedResourceId),
        roleId: Number(selectedRoleId),
        allocationPercent: Number(allocationPercent),
        allocationStartDate,
        allocationEndDate,
      });
      setMessage('Resource allocation created successfully.');
      setError('');
      setSelectedResourceId('');
      setAllocationPercent('100');
      setAllocationStartDate('');
      setAllocationEndDate('');
      loadAllocations(selectedProjectId);
    } catch (err) {
      setError(err.message || 'Failed to create allocation');
    }
  };

  const selectedProject = projects.find((project) => Number(project.projectId) === Number(selectedProjectId));

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol>
          <h1>Resource Assignments</h1>
          <p className="text-muted">
            Allocate named resources to approved projects and validate capacity against the approved baseline.
          </p>
        </CCol>
      </CRow>

      <CCard className="mb-4">
        <CCardBody>
          {message && <CAlert color="success">{message}</CAlert>}
          {error && <CAlert color="danger">{error}</CAlert>}
          {loading ? (
            <div className="text-center py-5">
              <CSpinner />
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <CRow className="g-3">
                <CCol md={4}>
                  <CFormLabel>Approved Project</CFormLabel>
                  <CFormSelect
                    value={selectedProjectId}
                    onChange={(event) => setSelectedProjectId(event.target.value)}
                  >
                    <option value="">Choose project</option>
                    {projects.map((project) => (
                      <option key={project.projectId} value={project.projectId}>
                        {project.projectName} ({project.projectId})
                      </option>
                    ))}
                  </CFormSelect>
                </CCol>
                <CCol md={4}>
                  <CFormLabel>Resource</CFormLabel>
                  <CFormSelect
                    value={selectedResourceId}
                    onChange={(event) => setSelectedResourceId(event.target.value)}
                  >
                    <option value="">Choose resource</option>
                    {resources.map((resource) => (
                      <option key={resource.resourceId} value={resource.resourceId}>
                        {resource.employeeName} ({resource.primaryRoleName})
                      </option>
                    ))}
                  </CFormSelect>
                </CCol>
                <CCol md={4}>
                  <CFormLabel>Role</CFormLabel>
                  <CFormSelect
                    value={selectedRoleId}
                    onChange={(event) => setSelectedRoleId(event.target.value)}
                  >
                    <option value="">Choose role</option>
                    {roles.map((role) => (
                      <option key={role.roleId} value={role.roleId}>
                        {role.roleName}
                      </option>
                    ))}
                  </CFormSelect>
                </CCol>
                <CCol md={3}>
                  <CFormLabel>Allocation %</CFormLabel>
                  <CFormInput
                    type="number"
                    min="1"
                    max="100"
                    value={allocationPercent}
                    onChange={(event) => setAllocationPercent(event.target.value)}
                  />
                </CCol>
                <CCol md={3}>
                  <CFormLabel>Start Date</CFormLabel>
                  <CFormInput
                    type="date"
                    value={allocationStartDate}
                    onChange={(event) => setAllocationStartDate(event.target.value)}
                    min={selectedProject?.draftData?.deliveryDetails?.start_date || ''}
                  />
                </CCol>
                <CCol md={3}>
                  <CFormLabel>End Date</CFormLabel>
                  <CFormInput
                    type="date"
                    value={allocationEndDate}
                    onChange={(event) => setAllocationEndDate(event.target.value)}
                    max={selectedProject?.draftData?.deliveryDetails?.planned_end_date || ''}
                  />
                </CCol>
                <CCol md={3} className="d-flex align-items-end">
                  <CButton type="submit" color="primary">Allocate Resource</CButton>
                </CCol>
              </CRow>
            </form>
          )}
        </CCardBody>
      </CCard>

      {selectedProject && (
        <CCard>
          <CCardBody>
            <h5>Allocations for {selectedProject.projectName}</h5>
            <div className="table-responsive">
              <CTable hover align="middle" className="mb-0">
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell>Resource</CTableHeaderCell>
                    <CTableHeaderCell>Role</CTableHeaderCell>
                    <CTableHeaderCell>Percent</CTableHeaderCell>
                    <CTableHeaderCell>Start</CTableHeaderCell>
                    <CTableHeaderCell>End</CTableHeaderCell>
                    <CTableHeaderCell>Status</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {allocations.map((allocation) => (
                    <CTableRow key={allocation.allocationId}>
                      <CTableDataCell>{allocation.employeeName || allocation.resourceId}</CTableDataCell>
                      <CTableDataCell>{allocation.roleName || allocation.roleId}</CTableDataCell>
                      <CTableDataCell>{allocation.allocationPercent}%</CTableDataCell>
                      <CTableDataCell>{allocation.allocationStartDate || '-'}</CTableDataCell>
                      <CTableDataCell>{allocation.allocationEndDate || '-'}</CTableDataCell>
                      <CTableDataCell>{allocation.allocationStatus}</CTableDataCell>
                    </CTableRow>
                  ))}
                  {allocations.length === 0 && (
                    <CTableRow>
                      <CTableDataCell colSpan={6} className="text-center text-muted py-4">
                        No named resource allocations exist for this project.
                      </CTableDataCell>
                    </CTableRow>
                  )}
                </CTableBody>
              </CTable>
            </div>
          </CCardBody>
        </CCard>
      )}
    </div>
  );
};

export default ResourceAllocationPage;
