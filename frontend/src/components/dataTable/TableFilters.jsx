import React from 'react';
import { CFormInput, CFormSelect } from '@coreui/react';
import DateDisplayInput from '../projectWizard/DateDisplayInput';

const TableFilters = ({ filters, onChange, config = [] }) => {
  const handleChange = (key, value) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };

  return (
    <div className="row g-2 mb-3">
      {config.map((filter) => (
        <div className="col-md-3" key={filter.key}>
          {filter.type === 'select' ? (
            <CFormSelect
              aria-label={filter.label}
              value={filters[filter.key] || ''}
              onChange={(event) => handleChange(filter.key, event.target.value)}
            >
              <option value="">{filter.label}</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </CFormSelect>
          ) : filter.type === 'date' ? (
            <DateDisplayInput
              value={filters[filter.key] || ''}
              onChange={(value) => handleChange(filter.key, value)}
            />
          ) : (
            <CFormInput
              aria-label={filter.label}
              type={filter.type || 'text'}
              value={filters[filter.key] || ''}
              placeholder={filter.label}
              onChange={(event) => handleChange(filter.key, event.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default TableFilters;
