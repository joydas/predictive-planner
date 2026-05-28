import { NODE_API_URL } from '../config';
import authService from './authService';

const API_BASE_URL = `${NODE_API_URL}/api/master-data`;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...authService.getAuthHeader(),
});

const handleResponse = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Master data request failed');
  }
  return data;
};

export async function getPlanningMasterData() {
  const response = await fetch(`${API_BASE_URL}/planning`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function listIndustries() {
  const response = await fetch(`${API_BASE_URL}/industries`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}
