import React from 'react';
import {
  CAlert,
  CButton,
  CCard,
  CCardBody,
  CSpinner,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from '@coreui/react';
import TablePagination from './TablePagination';

const DataTable = ({
  columns,
  rows,
  loading,
  error,
  sortBy,
  sortOrder,
  onSort,
  page,
  pageSize,
  totalRecords,
  totalPages,
  onPageChange,
  onPageSizeChange,
  emptyMessage = 'No records available.',
  noResultsMessage = 'No records match the current filters.',
  hasActiveFilters = false,
}) => {
  const renderSortIndicator = (column) => {
    if (!column.sortKey || sortBy !== column.sortKey) return '';
    return sortOrder === 'ASC' ? ' ↑' : ' ↓';
  };

  return (
    <CCard>
      <CCardBody className="p-0">
        {error && <CAlert color="danger" className="m-3">{error}</CAlert>}
        {loading ? (
          <div className="text-center py-5">
            <CSpinner />
            <div className="text-muted mt-2">Loading records...</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-5">
            <h5>{hasActiveFilters ? noResultsMessage : emptyMessage}</h5>
          </div>
        ) : (
          <div className="table-responsive">
            <CTable hover align="middle" className="mb-0">
              <CTableHead>
                <CTableRow>
                  {columns.map((column) => (
                    <CTableHeaderCell key={column.key} className={column.headerClassName || column.className || ''}>
                      {column.sortKey ? (
                        <CButton
                          color="link"
                          className={`p-0 text-decoration-none fw-semibold ${column.className?.includes('text-end') ? 'text-end' : ''}`}
                          onClick={() => onSort(column.sortKey)}
                        >
                          {column.label}{renderSortIndicator(column)}
                        </CButton>
                      ) : (
                        column.label
                      )}
                    </CTableHeaderCell>
                  ))}
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {rows.map((row) => (
                  <CTableRow key={row.id || row.projectId || row.crId}>
                    {columns.map((column) => (
                      <CTableDataCell key={`${row.id || row.projectId || row.crId}-${column.key}`} className={column.className || ''}>
                        {column.render ? column.render(row) : row[column.key] ?? '-'}
                      </CTableDataCell>
                    ))}
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          </div>
        )}
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalRecords={totalRecords}
          totalPages={totalPages}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </CCardBody>
    </CCard>
  );
};

export default DataTable;
