import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CContainer, CRow, CCol, CCard, CCardBody, CForm, CFormInput, CButton, CAlert, CSpinner, CFormFeedback } from '@coreui/react';
import authService from '../services/authService';
import '../styles/login.css';

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear field-specific error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      const response = await authService.login(formData.email, formData.password);

      // Redirect based on role
      const role = response.user.role;
      if (role === 'pm' || role === 'admin') {
        navigate('/projects');
      } else if (role === 'leadership') {
        navigate('/dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      setApiError(error.message || 'Login failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <CContainer className="h-100">
        <CRow className="h-100 align-items-center justify-content-center">
          <CCol md={6} lg={5} xl={4}>
            <CCard className="shadow-lg login-card">
              <CCardBody className="p-4">
                {/* Header */}
                <div className="text-center mb-4">
                  <div className="login-logo mb-3">🚀</div>
                  <h2 className="mb-1" style={{ color: '#2c3e50', fontWeight: '700' }}>
                    Predictive Planner
                  </h2>
                  <p className="text-muted small">Admin Dashboard</p>
                </div>

                {/* Error Alert */}
                {apiError && (
                  <CAlert color="danger" className="mb-4" dismissible onClose={() => setApiError('')}>
                    <strong>Login Failed</strong>
                    <div>{apiError}</div>
                  </CAlert>
                )}

                {/* Login Form */}
                <CForm onSubmit={handleSubmit}>
                  {/* Email Field */}
                  <div className="mb-3">
                    <label htmlFor="email" className="form-label fw-semibold">
                      Email Address
                    </label>
                    <CFormInput
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="Enter your email"
                      invalid={!!errors.email}
                      disabled={loading}
                      className="form-control-lg"
                    />
                    {errors.email && (
                      <CFormFeedback invalid className="d-block">
                        {errors.email}
                      </CFormFeedback>
                    )}
                  </div>

                  {/* Password Field */}
                  <div className="mb-4">
                    <label htmlFor="password" className="form-label fw-semibold">
                      Password
                    </label>
                    <CFormInput
                      type="password"
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      placeholder="Enter your password"
                      invalid={!!errors.password}
                      disabled={loading}
                      className="form-control-lg"
                    />
                    {errors.password && (
                      <CFormFeedback invalid className="d-block">
                        {errors.password}
                      </CFormFeedback>
                    )}
                  </div>

                  {/* Submit Button */}
                  <CButton
                    type="submit"
                    color="primary"
                    className="w-100 py-2 fw-semibold"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <CSpinner component="span" size="sm" className="me-2" aria-hidden="true" />
                        Logging in...
                      </>
                    ) : (
                      'Login'
                    )}
                  </CButton>
                </CForm>

                {/* Demo Credentials */}
                {/* <div className="mt-4 pt-3 border-top">
                  <p className="text-muted small mb-2">Demo Credentials:</p>
                  <div className="bg-light p-2 rounded small">
                    <div><strong>PM:</strong> pm@example.com / password</div>
                    <div><strong>Leadership:</strong> leadership@example.com / password</div>
                    <div><strong>Admin:</strong> admin@example.com / password</div>
                  </div>
                </div> */}
              </CCardBody>
            </CCard>
          </CCol>
        </CRow>
      </CContainer>
    </div>
  );
};

export default Login;
