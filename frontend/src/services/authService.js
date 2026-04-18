// Auth Service - handles login, logout, and user management
import { NODE_API_URL } from '../config';

const API_BASE_URL = NODE_API_URL;

class AuthService {
  /**
   * Login user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise} - Response with user data
   */
  async login(email, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Store user in localStorage
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Logout user and clear localStorage
   */
  logout() {
    localStorage.removeItem('user');
  }

  /**
   * Get current logged-in user
   * @returns {object|null} - User object or null if not logged in
   */
  getCurrentUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} - True if user is logged in
   */
  isAuthenticated() {
    return !!this.getCurrentUser();
  }

  /**
   * Get user role
   * @returns {string|null} - User role or null
   */
  getUserRole() {
    const user = this.getCurrentUser();
    return user ? user.role : null;
  }
}

const authService = new AuthService();

export default authService;
