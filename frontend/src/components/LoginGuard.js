import React from 'react';
import { Navigate } from 'react-router-dom';
import authService from '../services/authService';

/**
 * LoginGuard - Redirects authenticated users away from login page
 * Redirects to appropriate page based on user role
 */
const LoginGuard = ({ children }) => {
  const isAuthenticated = authService.isAuthenticated();

  if (isAuthenticated) {
    const user = authService.getCurrentUser();
    const role = user?.role;

    // Redirect based on role
    if (role === 'pm' || role === 'admin') {
      return <Navigate to="/projects" replace />;
    } else if (role === 'leadership') {
      return <Navigate to="/dashboard" replace />;
    } else {
      // Default fallback
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children;
};

export default LoginGuard;