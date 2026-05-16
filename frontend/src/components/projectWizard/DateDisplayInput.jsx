import { CFormInput } from '@coreui/react';
import { formatApiDate, formatDisplayDate } from '../../utils/dateUtils';

const DateDisplayInput = ({ value, onChange, invalid, min, max }) => {
  return (
    <CFormInput
      type="date"
      value={formatApiDate(value)}
      min={formatApiDate(min) || undefined}
      max={formatApiDate(max) || undefined}
      onChange={(event) => onChange(formatApiDate(event.target.value))}
      invalid={invalid}
    />
  );
};

export default DateDisplayInput;
