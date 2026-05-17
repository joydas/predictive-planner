import { NODE_API_URL } from '../config';
import authService from './authService';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...authService.getAuthHeader(),
});

const handleResponse = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Operational dashboard request failed');
  }
  return data;
};

export async function getOperationalDashboard(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const response = await fetch(`${NODE_API_URL}/api/operational-dashboard?${searchParams.toString()}`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}
