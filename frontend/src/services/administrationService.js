import { NODE_API_URL } from '../config';
import authService from './authService';

const API_BASE_URL = `${NODE_API_URL}/api/administration`;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...authService.getAuthHeader(),
});

const handleResponse = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Administration request failed');
  }
  return data;
};

export async function listOrganizations() {
  const response = await fetch(`${API_BASE_URL}/organizations`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function listOrganizationOptions() {
  const response = await fetch(`${API_BASE_URL}/organizations/options`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function createOrganization(payload) {
  const response = await fetch(`${API_BASE_URL}/organizations`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateOrganization(organizationId, payload) {
  const response = await fetch(`${API_BASE_URL}/organizations/${organizationId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function getOrganizationSummary(organizationId) {
  const response = await fetch(`${API_BASE_URL}/organizations/${organizationId}/summary`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function listAdminUsers(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const response = await fetch(`${API_BASE_URL}/users${suffix}`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function createAdminUser(payload) {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateAdminUser(userId, payload) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function resetAdminUserPassword(userId, payload) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}/reset-password`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}
