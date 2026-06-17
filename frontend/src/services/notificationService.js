import { NODE_API_URL } from '../config';
import authService from './authService';

const API_BASE_URL = `${NODE_API_URL}/api/notification`;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...authService.getAuthHeader(),
});

const handleResponse = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
};

export async function getNotifications(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.set('limit', params.limit);
  if (params.offset) searchParams.set('offset', params.offset);

  const response = await fetch(`${API_BASE_URL}?${searchParams.toString()}`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function getUnreadCount() {
  const response = await fetch(`${API_BASE_URL}/unread-count`, {
    method: 'GET',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function markAsRead(id) {
  const response = await fetch(`${API_BASE_URL}/${id}/mark-read`, {
    method: 'PUT',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function markAllAsRead() {
  const response = await fetch(`${API_BASE_URL}/mark-all-read`, {
    method: 'PUT',
    headers: getHeaders(),
  });
  return handleResponse(response);
}
