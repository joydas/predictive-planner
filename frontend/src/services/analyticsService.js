import { NODE_API_URL } from '../config';
import authService from './authService';

const API_BASE_URL = `${NODE_API_URL}/api/analytics`;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...authService.getAuthHeader(),
});

async function handleResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Analytics request failed');
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
