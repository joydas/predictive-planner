import React, { useState } from 'react';
import { CBadge, CTable, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow } from '@coreui/react';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { formatCurrency } from '../../../utils/resourcePlanning';

const severityColors = {
  'Not Measured': 'secondary',
  Normal: 'success',
  Medium: 'warning',
  High: 'danger',
  Urgent: 'dark',
};

const ProgressHistorySection = ({ snapshots }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="section-container">
      <div 
        className="section-header card-header collapsible-header" 
        onClick={() => setIsOpen(!isOpen)}
      >
        <strong>Progress History ({snapshots?.length || 0})</strong>
        <span className={`collapsible-icon ${isOpen ? 'open' : ''}`}>▼</span>
      </div>
      {isOpen && (
        <div className="section-body p-0">
          <div className="table-responsive">
            <CTable hover small className="mb-0 compact-table">
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Date</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Effort (PD)</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Budget</CTableHeaderCell>
                  <CTableHeaderCell className="text-center">Completion %</CTableHeaderCell>
                  <CTableHeaderCell>Severity</CTableHeaderCell>
                  <CTableHeaderCell>Remarks</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {snapshots?.length > 0 ? (
                  snapshots.map((snapshot) => (
                    <CTableRow key={snapshot.snapshotId}>
                      <CTableDataCell>{formatDisplayDate(snapshot.snapshotDate)}</CTableDataCell>
                      <CTableDataCell className="text-end">{snapshot.actualEffortPd}</CTableDataCell>
                      <CTableDataCell className="text-end">{formatCurrency(snapshot.actualBudget)}</CTableDataCell>
                      <CTableDataCell className="text-center">{snapshot.actualCompletionPercent}%</CTableDataCell>
                      <CTableDataCell>
                        <CBadge color={severityColors[snapshot.severity] || 'secondary'}>
                          {snapshot.severity}
                        </CBadge>
                      </CTableDataCell>
                      <CTableDataCell>
                        <small className="text-muted">{snapshot.remarks || '-'}</small>
                      </CTableDataCell>
                    </CTableRow>
                  ))
                ) : (
                  <CTableRow>
                    <CTableDataCell colSpan={6} className="text-center text-muted py-3">
                      No progress snapshots recorded yet.
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

export default ProgressHistorySection;
