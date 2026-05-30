import React, { useEffect, useState } from 'react';
import {
  CAlert,
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
import { getUtilization, getBench } from '../../services/resourceService';

const ResourceUtilizationPage = () => {
  const [utilization, setUtilization] = useState(null);
  const [benchData, setBenchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMetrics = async () => {
    try {
      setLoading(true);
      const [util, bench] = await Promise.all([getUtilization(), getBench()]);
      setUtilization(util);
      setBenchData(bench);
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to load resource utilization metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol>
          <h1>Resource Utilization</h1>
          <p className="text-muted">
            Review current utilization, overbooked resources, and bench capacity for workforce planning.
          </p>
        </CCol>
      </CRow>

      {error && <CAlert color="danger">{error}</CAlert>}

      {loading || !utilization || !benchData ? (
        <div className="text-center py-5">
          <CSpinner />
        </div>
      ) : (
        <>
          <CRow className="g-3 mb-4">
            <CCol md={3}>
              <CCard>
                <CCardBody>
                  <h5>Total resources</h5>
                  <p className="display-6">{utilization.summary.totalResources}</p>
                </CCardBody>
              </CCard>
            </CCol>
            <CCol md={3}>
              <CCard>
                <CCardBody>
                  <h5>Average utilization</h5>
                  <p className="display-6">{utilization.summary.averageUtilization}%</p>
                </CCardBody>
              </CCard>
            </CCol>
            <CCol md={3}>
              <CCard>
                <CCardBody>
                  <h5>Overbooked</h5>
                  <p className="display-6">{utilization.summary.overAllocated}</p>
                </CCardBody>
              </CCard>
            </CCol>
            <CCol md={3}>
              <CCard>
                <CCardBody>
                  <h5>Bench capacity</h5>
                  <p className="display-6">{benchData.benchCount}</p>
                </CCardBody>
              </CCard>
            </CCol>
          </CRow>

          <CRow className="mb-4">
            <CCol>
              <CCard>
                <CCardHeader>Overallocated Resources</CCardHeader>
                <CCardBody>
                  <div className="table-responsive">
                    <CTable hover align="middle" className="mb-0">
                      <CTableHead>
                        <CTableRow>
                          <CTableHeaderCell>Name</CTableHeaderCell>
                          <CTableHeaderCell>Role</CTableHeaderCell>
                          <CTableHeaderCell>Location</CTableHeaderCell>
                          <CTableHeaderCell className="text-end">Utilization</CTableHeaderCell>
                          <CTableHeaderCell className="text-end">Capacity Left</CTableHeaderCell>
                        </CTableRow>
                      </CTableHead>
                      <CTableBody>
                        {utilization.overAllocatedResources.length > 0 ? (
                          utilization.overAllocatedResources.map((resource) => (
                            <CTableRow key={resource.resourceId}>
                              <CTableDataCell>{resource.employeeName}</CTableDataCell>
                              <CTableDataCell>{resource.primaryRoleName}</CTableDataCell>
                              <CTableDataCell>{resource.locationType}</CTableDataCell>
                              <CTableDataCell className="text-end">{`${resource.utilizationPercent}%`}</CTableDataCell>
                              <CTableDataCell className="text-end">{`${resource.capacityLeft}%`}</CTableDataCell>
                            </CTableRow>
                          ))
                        ) : (
                          <CTableRow>
                            <CTableDataCell colSpan={5} className="text-center text-muted py-4">
                              No overallocated resources at this time.
                            </CTableDataCell>
                          </CTableRow>
                        )}
                      </CTableBody>
                    </CTable>
                  </div>
                </CCardBody>
              </CCard>
            </CCol>
          </CRow>

          <CRow>
            <CCol>
              <CCard>
                <CCardHeader>Bench Capacity</CCardHeader>
                <CCardBody>
                  <div className="table-responsive">
                    <CTable hover align="middle" className="mb-0">
                      <CTableHead>
                        <CTableRow>
                          <CTableHeaderCell>Name</CTableHeaderCell>
                          <CTableHeaderCell>Role</CTableHeaderCell>
                          <CTableHeaderCell className="text-end">Utilization</CTableHeaderCell>
                          <CTableHeaderCell className="text-end">Capacity Left</CTableHeaderCell>
                          <CTableHeaderCell>Next Release Date</CTableHeaderCell>
                        </CTableRow>
                      </CTableHead>
                      <CTableBody>
                        {benchData.benchItems.length > 0 ? (
                          benchData.benchItems.slice(0, 20).map((resource) => (
                            <CTableRow key={resource.resourceId}>
                              <CTableDataCell>{resource.employeeName}</CTableDataCell>
                              <CTableDataCell>{resource.primaryRoleName}</CTableDataCell>
                              <CTableDataCell className="text-end">{`${resource.utilizationPercent}%`}</CTableDataCell>
                              <CTableDataCell className="text-end">{`${resource.capacityLeft}%`}</CTableDataCell>
                              <CTableDataCell>{resource.nextReleaseDate || '-'}</CTableDataCell>
                            </CTableRow>
                          ))
                        ) : (
                          <CTableRow>
                            <CTableDataCell colSpan={5} className="text-center text-muted py-4">
                              No bench capacity available.
                            </CTableDataCell>
                          </CTableRow>
                        )}
                      </CTableBody>
                    </CTable>
                  </div>
                </CCardBody>
              </CCard>
            </CCol>
          </CRow>

          <CButton color="secondary" className="mt-3" onClick={loadMetrics}>Refresh Metrics</CButton>
        </>
      )}
    </div>
  );
};

export default ResourceUtilizationPage;
