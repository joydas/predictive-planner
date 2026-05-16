import React from 'react';
import { CButton, CFormSelect } from '@coreui/react';

const TablePagination = ({ page, pageSize, totalRecords, totalPages, onPageChange, onPageSizeChange }) => (
  <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 p-3">
    <div className="text-muted">
      Page {page} of {totalPages} · {totalRecords} record(s)
    </div>
    <div className="d-flex align-items-center gap-2">
      <CFormSelect
        size="sm"
        value={pageSize}
        style={{ width: 90 }}
        onChange={(event) => onPageSizeChange(Number(event.target.value))}
      >
        {[10, 25, 50, 100].map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </CFormSelect>
      <CButton
        color="secondary"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Prev
      </CButton>
      <CButton
        color="secondary"
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </CButton>
    </div>
  </div>
);

export default TablePagination;
