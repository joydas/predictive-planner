import React from 'react';
import { CButton, CFormInput } from '@coreui/react';

const TableToolbar = ({
  search,
  searchPlaceholder = 'Search',
  onSearchChange,
  onReset,
  children,
}) => (
  <div className="d-flex flex-column flex-xl-row gap-3 justify-content-between align-items-xl-end mb-3">
    <div className="d-flex flex-column flex-md-row gap-2 flex-grow-1">
      <CFormInput
        type="search"
        value={search}
        placeholder={searchPlaceholder}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <CButton color="secondary" variant="outline" onClick={onReset}>
        Reset Filters
      </CButton>
    </div>
    {children && <div className="d-flex flex-wrap gap-2">{children}</div>}
  </div>
);

export default TableToolbar;
