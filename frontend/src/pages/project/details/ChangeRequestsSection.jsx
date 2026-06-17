import React, { useState } from 'react';
import { CBadge, CTable, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow } from '@coreui/react';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { formatCurrency } from '../../../utils/resourcePlanning';

const crStatusColors = {
  DRAFT: 'secondary',
  SUBMITTED: 'info',
  RETURNED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
};

const ChangeRequestsSection = ({ crs }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="section-container">
      <div 
        className="section-header collapsible-header" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <h4>Change Requests ({crs?.length || 0})</h4>
        <span className={`collapsible-icon ${isOpen ? 'open' : ''}`}>▼</span>
      </div>
      {isOpen && (
        <div className="section-body p-0">
          <div className="table-responsive">
            <CTable hover small className="mb-0 compact-table">
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>CR ID</CTableHeaderCell>
                  <CTableHeaderCell>Title</CTableHeaderCell>
                  <CTableHeaderCell>Type</CTableHeaderCell>
                  <CTableHeaderCell>Status</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Effort Impact</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Budget Impact</CTableHeaderCell>
                  <CTableHeaderCell>Date</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {crs?.length > 0 ? (
                  crs.map((cr) => (
                    <CTableRow key={cr.crId}>
                      <CTableDataCell>{cr.crId}</CTableDataCell>
                      <CTableDataCell>{cr.title}</CTableDataCell>
                      <CTableDataCell>{cr.crType || cr.category || 'N/A'}</CTableDataCell>
                      <CTableDataCell>
                        <CBadge color={crStatusColors[cr.status] || 'secondary'}>
                          {cr.status}
                        </CBadge>
                      </CTableDataCell>
                      <CTableDataCell className="text-end">
                        {cr.totalEstimationImpactPd > 0 ? '+' : ''}{cr.totalEstimationImpactPd} PD
                      </CTableDataCell>
                      <CTableDataCell className="text-end">
                        {cr.totalBudgetImpact > 0 ? '+' : ''}{formatCurrency(cr.totalBudgetImpact)}
                      </CTableDataCell>
                      <CTableDataCell>{formatDisplayDate(cr.createdAt)}</CTableDataCell>
                    </CTableRow>
                  ))
                ) : (
                  <CTableRow>
                    <CTableDataCell colSpan={7} className="text-center text-muted py-3">
                      No change requests for this project.
                    </CTableDataCell>
                  </CTableRow>
                )}
              </CTableBody>
            </CTable>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChangeRequestsSection;
