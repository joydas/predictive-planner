import { NODE_API_URL } from '../config';
import authService from './authService';

const API_BASE_URL = `${NODE_API_URL}/api/cr`;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...authService.getAuthHeader(),
});

const handleResponse = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Change request service request failed');
  }
  return data;
};

export async function createChangeRequest(payload) {
  const response = await fetch(API_BASE_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function createCrDraft(payload) {
  const response = await fetch(`${API_BASE_URL}/draft`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateCrDraft(crId, payload) {
  const response = await fetch(`${API_BASE_URL}/${crId}/draft`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function submitCrDraft(crId, crData, comment) {
  const response = await fetch(`${API_BASE_URL}/${crId}/submit`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ crData, comment }),
  });
  return handleResponse(response);
}

export async function getChangeRequest(crId) {
  const response = await fetch(`${API_BASE_URL}/${crId}`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function getProjectChangeRequests(projectId) {
  const response = await fetch(`${API_BASE_URL}/project/${projectId}`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function getProjectStaffingBaseline(projectId, excludeCrId) {
  const searchParams = new URLSearchParams();
  if (excludeCrId) searchParams.set('excludeCrId', excludeCrId);
  const query = searchParams.toString();
  const response = await fetch(`${API_BASE_URL}/project/${projectId}/staffing-baseline${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function transitionChangeRequest(crId, action, comment) {
  const response = await fetch(`${API_BASE_URL}/${crId}/${action}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ comment }),
  });
  return handleResponse(response);
}

export async function listChangeRequests(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const response = await fetch(`${NODE_API_URL}/api/crs?${searchParams.toString()}`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}
