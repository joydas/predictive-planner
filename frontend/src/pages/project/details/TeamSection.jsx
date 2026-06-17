import React from 'react';
import { CTable, CTableBody, CTableDataCell, CTableHead, CTableHeaderCell, CTableRow } from '@coreui/react';
import { formatDisplayDate } from '../../../utils/dateUtils';
import { formatCurrency } from '../../../utils/resourcePlanning';

const TeamSection = ({ teamRows }) => {
  return (
    <div className="section-container">
      <div className="section-header">
        <h4>Team & Resource Loading</h4>
      </div>
      <div className="section-body p-0">
        <div className="table-responsive">
          <CTable hover small className="mb-0 compact-table">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>Role</CTableHeaderCell>
                <CTableHeaderCell>Location</CTableHeaderCell>
                <CTableHeaderCell className="text-center">Count</CTableHeaderCell>
                <CTableHeaderCell className="text-center">Alloc %</CTableHeaderCell>
                <CTableHeaderCell>Start</CTableHeaderCell>
                <CTableHeaderCell>End</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Effort (PD)</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Cost</CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {teamRows.length > 0 ? (
                teamRows.map((row, index) => (
                  <CTableRow key={index}>
                    <CTableDataCell>{row.role}</CTableDataCell>
                    <CTableDataCell>{row.locationType}</CTableDataCell>
                    <CTableDataCell className="text-center">{row.count}</CTableDataCell>
                    <CTableDataCell className="text-center">{row.allocationPercent}%</CTableDataCell>
                    <CTableDataCell>{formatDisplayDate(row.startDate)}</CTableDataCell>
                    <CTableDataCell>{formatDisplayDate(row.endDate)}</CTableDataCell>
                    <CTableDataCell className="text-end">{row.plannedEffort}</CTableDataCell>
                    <CTableDataCell className="text-end">{formatCurrency(row.plannedCost)}</CTableDataCell>
                  </CTableRow>
                ))
              ) : (
                <CTableRow>
                  <CTableDataCell colSpan={8} className="text-center text-muted py-3">
                    No resource loading data available.
                  </CTableDataCell>
                </CTableRow>
              )}
            </CTableBody>
          </CTable>
        </div>
      </div>
    </div>
  );
};

export default TeamSection;
