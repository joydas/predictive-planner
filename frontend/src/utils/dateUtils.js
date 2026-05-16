import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

const API_DATE_FORMAT = 'YYYY-MM-DD';
const DISPLAY_DATE_FORMAT = 'DD-MMM-YY';
const DISPLAY_DATETIME_FORMAT = 'DD-MMM-YY HH:mm';

export function parseBackendDate(value) {
  if (!value) return null;
  if (dayjs.isDayjs(value)) return value.isValid() ? value : null;

  const raw = String(value).trim();
  const parsed = raw.length <= 10
    ? dayjs(raw, API_DATE_FORMAT, true)
    : dayjs(raw);

  return parsed.isValid() ? parsed : null;
}

export function formatApiDate(value) {
  const parsed = parseBackendDate(value);
  return parsed ? parsed.format(API_DATE_FORMAT) : '';
}

export function formatDisplayDate(value) {
  const parsed = parseBackendDate(value);
  return parsed ? parsed.format(DISPLAY_DATE_FORMAT) : '-';
}

export function formatDisplayDateTime(value) {
  const parsed = parseBackendDate(value);
  return parsed ? parsed.format(DISPLAY_DATETIME_FORMAT) : '-';
}

export function isDateWithinRange(value, min, max) {
  const parsed = parseBackendDate(value);
  if (!parsed) return false;
  const minDate = parseBackendDate(min);
  const maxDate = parseBackendDate(max);
  if (minDate && parsed.isBefore(minDate, 'day')) return false;
  if (maxDate && parsed.isAfter(maxDate, 'day')) return false;
  return true;
}
