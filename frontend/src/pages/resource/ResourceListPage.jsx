import React, { useEffect, useState } from 'react';
import {
  CButton,
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
  CCard,
  CCardBody,
  CAlert,
} from '@coreui/react';
import { listResources } from '../../services/resourceService';
import { getPlanningMasterData } from '../../services/masterDataService';

const ResourceListPage = () => {
  const [filters, setFilters] = useState({
    role: '',
    skill: '',
    experienceMin: '',
    experienceMax: '',
    location: '',
    availableFrom: '',
    availableTo: '',
  });
  const [resources, setResources] = useState([]);
  const [roles, setRoles] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadMasterData = async () => {
    try {
      const planningData = await getPlanningMasterData();
      setRoles(planningData.roles || []);
      setSkills(planningData.skills || []);
    } catch (err) {
      setError(err.message || 'Unable to load role and skill metadata');
    }
  };

  const loadResources = async () => {
    try {
      setLoading(true);
      const items = await listResources(filters);
      setResources(items.map((item) => ({ ...item, id: item.resourceId })));
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load resources');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMasterData();
    loadResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (field) => (event) => {
    setFilters((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSearch = async () => {
    await loadResources();
  };

  const handleReset = () => {
    setFilters({
      role: '',
      skill: '',
      experienceMin: '',
      experienceMax: '',
      location: '',
      availableFrom: '',
      availableTo: '',
    });
    setTimeout(loadResources, 0);
  };

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol>
          <h1>Resource Directory</h1>
          <p className="text-muted">
            Search named resources, review capacity, and identify bench availability.
          </p>
        </CCol>
      </CRow>

      <CCard className="mb-4">
        <CCardBody>
          <CRow className="g-3">
            <CCol md={4}>
              <CFormLabel>Role</CFormLabel>
              <CFormSelect value={filters.role} onChange={handleChange('role')}>
                <option value="">Any</option>
                {roles.map((role) => (
                  <option key={role.roleId} value={role.roleName}>{role.roleName}</option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol md={4}>
              <CFormLabel>Skill</CFormLabel>
              <CFormSelect value={filters.skill} onChange={handleChange('skill')}>
                <option value="">Any</option>
                {skills.map((skill) => (
                  <option key={skill.skillId} value={skill.skillName}>{skill.skillName}</option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol md={4}>
              <CFormLabel>Location</CFormLabel>
              <CFormSelect value={filters.location} onChange={handleChange('location')}>
                <option value="">Any</option>
                <option value="ONSITE">ONSITE</option>
                <option value="OFFSHORE">OFFSHORE</option>
              </CFormSelect>
            </CCol>
            <CCol md={3}>
              <CFormLabel>Experience Min</CFormLabel>
              <CFormInput type="number" value={filters.experienceMin} onChange={handleChange('experienceMin')} placeholder="Years" />
            </CCol>
            <CCol md={3}>
              <CFormLabel>Experience Max</CFormLabel>
              <CFormInput type="number" value={filters.experienceMax} onChange={handleChange('experienceMax')} placeholder="Years" />
            </CCol>
            <CCol md={3}>
              <CFormLabel>Available From</CFormLabel>
              <CFormInput type="date" value={filters.availableFrom} onChange={handleChange('availableFrom')} />
            </CCol>
            <CCol md={3}>
              <CFormLabel>Available To</CFormLabel>
              <CFormInput type="date" value={filters.availableTo} onChange={handleChange('availableTo')} />
            </CCol>
          </CRow>

          <div className="mt-3 d-flex gap-2">
            <CButton color="primary" onClick={handleSearch}>Search</CButton>
            <CButton color="secondary" variant="outline" onClick={handleReset}>Reset</CButton>
          </div>
        </CCardBody>
      </CCard>

      {error && <CAlert color="danger">{error}</CAlert>}

      <CCard>
        <CCardBody>
          {loading ? (
            <div className="text-center py-5">
              <CSpinner />
              <div className="text-muted mt-2">Loading resources...</div>
            </div>
          ) : (
            <div className="table-responsive">
              <CTable hover align="middle" className="mb-0">
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell>Code</CTableHeaderCell>
                    <CTableHeaderCell>Name</CTableHeaderCell>
                    <CTableHeaderCell>Role</CTableHeaderCell>
                    <CTableHeaderCell>Location</CTableHeaderCell>
                    <CTableHeaderCell>Experience</CTableHeaderCell>
                    <CTableHeaderCell>Skills</CTableHeaderCell>
                    <CTableHeaderCell>Utilization</CTableHeaderCell>
                    <CTableHeaderCell>Capacity Left</CTableHeaderCell>
                    <CTableHeaderCell>Status</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {resources.map((resource) => (
                    <CTableRow key={resource.resourceId}>
                      <CTableDataCell>{resource.employeeCode}</CTableDataCell>
                      <CTableDataCell>{resource.employeeName}</CTableDataCell>
                      <CTableDataCell>{resource.primaryRoleName}</CTableDataCell>
                      <CTableDataCell>{resource.locationType}</CTableDataCell>
                      <CTableDataCell>{resource.yearsExperience}</CTableDataCell>
                      <CTableDataCell>{resource.skills.join(', ')}</CTableDataCell>
                      <CTableDataCell>{`${resource.utilizationPercent}%`}</CTableDataCell>
                      <CTableDataCell>{`${resource.capacityLeft}%`}</CTableDataCell>
                      <CTableDataCell>{resource.overAllocated ? 'RED' : resource.utilizationPercent >= 90 ? 'AMBER' : 'GREEN'}</CTableDataCell>
                    </CTableRow>
                  ))}
                  {resources.length === 0 && (
                    <CTableRow>
                      <CTableDataCell colSpan={9} className="text-center text-muted py-4">
                        No resources found for the selected filters.
                      </CTableDataCell>
                    </CTableRow>
                  )}
                </CTableBody>
              </CTable>
            </div>
          )}
        </CCardBody>
      </CCard>
    </div>
  );
};

export default ResourceListPage;
