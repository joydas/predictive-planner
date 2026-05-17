import { parseBackendDate } from './dateUtils';

export function parseNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getWorkingDays(startDate, endDate) {
  const start = parseBackendDate(startDate);
  const end = parseBackendDate(endDate);
  if (!start || !end || end.isBefore(start, 'day')) return 0;

  let current = start.startOf('day');
  const last = end.startOf('day');
  let workingDays = 0;

  while (!current.isAfter(last, 'day')) {
    const day = current.day();
    if (day !== 0 && day !== 6) {
      workingDays += 1;
    }
    current = current.add(1, 'day');
  }

  return workingDays;
}

export const getInclusiveDays = getWorkingDays;

export function getRateForRole(roleId, locationType, rateCards = []) {
  const match = (rateCards || []).find((card) =>
    String(card.roleId) === String(roleId) && card.locationType === locationType
  );
  return parseNumber(match?.ratePerDay, 0);
}

export function deriveResourcePlanning({ rows = [], financial = {}, rateCards = [] }) {
  const enrichedRows = (rows || []).map((row) => {
    const count = parseNumber(row.count, 0);
    const allocationPercent = parseNumber(row.allocationPercent ?? row.allocation ?? 100, 0);
    const ratePerDay = parseNumber(row.ratePerDay, getRateForRole(row.roleId, row.locationType, rateCards));
    const workingDays = getWorkingDays(row.startDate, row.endDate);
    const effort = count * (allocationPercent / 100) * workingDays;
    const cost = effort * ratePerDay;

    return {
      ...row,
      allocationPercent,
      ratePerDay,
      durationDays: workingDays,
      workingDays,
      plannedEffort: effort,
      plannedCost: cost,
    };
  });

  const baseResourceCost = enrichedRows.reduce((sum, row) => sum + parseNumber(row.plannedCost, 0), 0);
  const planned_effort = enrichedRows.reduce((sum, row) => sum + parseNumber(row.plannedEffort, 0), 0);
  const estimated_team_size = enrichedRows.reduce((sum, row) => sum + parseNumber(row.count, 0), 0);
  const managementReservePercent = parseNumber(financial.management_reserve_percent, 0);
  const contingencyReservePercent = parseNumber(financial.contingency_reserve_percent, 0);
  const reserveMultiplier = 1 + (managementReservePercent + contingencyReservePercent) / 100;

  return {
    rows: enrichedRows,
    baseResourceCost,
    planned_effort,
    estimated_team_size,
    budget: baseResourceCost * reserveMultiplier,
  };
}

export function formatCurrency(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseNumber(value, 0));
}
