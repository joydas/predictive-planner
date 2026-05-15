import { NODE_API_URL } from '../config';
import authService from './authService';

const API_BASE_URL = `${NODE_API_URL}/api/project`;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...authService.getAuthHeader(),
});

const handleResponse = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Project service request failed');
  }
  return data;
};

export async function createDraft(draftPayload) {
  const response = await fetch(`${API_BASE_URL}/draft`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(draftPayload),
  });
  return handleResponse(response);
}

export async function updateDraft(draftId, draftPayload) {
  const response = await fetch(`${API_BASE_URL}/${draftId}/draft`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(draftPayload),
  });
  return handleResponse(response);
}

export async function getDraft(draftId) {
  const response = await fetch(`${API_BASE_URL}/${draftId}/draft`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function submitProject(payload) {
  const response = await fetch(`${API_BASE_URL}/submit`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}
