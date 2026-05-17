import { NODE_API_URL } from '../config';
import authService from './authService';

const API_BASE_URL = `${NODE_API_URL}/api/analytics`;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...authService.getAuthHeader(),
});

async function handleResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { message: await response.text() };

  if (!response.ok) {
    const message = String(data.message || '').startsWith('<!DOCTYPE')
      ? 'Analytics API endpoint is unavailable. Restart or deploy the Node backend with the latest analytics route.'
      : data.message;
    throw new Error(message || 'Analytics request failed');
  }

  if (!contentType.includes('application/json')) {
    throw new Error('Analytics API returned a non-JSON response. Check the Node API URL and backend route.');
  }

  return data;
}

export function getPmSummary() {
  return fetch(`${API_BASE_URL}/pm-summary`, { headers: getHeaders() }).then(handleResponse);
}

export function getAmSummary() {
  return fetch(`${API_BASE_URL}/am-summary`, { headers: getHeaders() }).then(handleResponse);
}

export function getMlAccuracy() {
  return fetch(`${API_BASE_URL}/ml-accuracy`, { headers: getHeaders() }).then(handleResponse);
}

export function getProjectRisk() {
  return fetch(`${API_BASE_URL}/project-risk`, { headers: getHeaders() }).then(handleResponse);
}

export function getCrTrends() {
  return fetch(`${API_BASE_URL}/cr-trends`, { headers: getHeaders() }).then(handleResponse);
}

export function getVarianceDashboard(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value);
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return fetch(`${API_BASE_URL}/variance-dashboard${suffix}`, { headers: getHeaders() }).then(handleResponse);
}
