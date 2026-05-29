import { NODE_API_URL } from '../config';
import authService from './authService';

const API_BASE_URL = `${NODE_API_URL}/api/admin`;

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

export async function listUsers() {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function createUser(payload) {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function updateUser(userId, payload) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function getMlAdministration() {
  const response = await fetch(`${API_BASE_URL}/ml`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function retrainMlModels() {
  const response = await fetch(`${API_BASE_URL}/ml/retrain`, {
    method: 'POST',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function getMlTrainingJob(jobId) {
  const response = await fetch(`${API_BASE_URL}/ml/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}
