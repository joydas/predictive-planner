import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DefaultLayout from './layouts/DefaultLayout';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import CreateProject from './pages/CreateProject';
import ProjectProgress from './pages/ProjectProgress';
import ChangeRequest from './pages/ChangeRequest';
import TeamRecommendation from './pages/TeamRecommendation';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import LoginGuard from './components/LoginGuard';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={
            <LoginGuard>
              <Login />
            </LoginGuard>
          }
        />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DefaultLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="create-project" element={<CreateProject />} />
          <Route path="progress/:projectId" element={<ProjectProgress />} />
          <Route path="change-request/:projectId" element={<ChangeRequest />} />
          <Route path="team-recommendation/:projectId" element={<TeamRecommendation />} />
        </Route>

        {/* Fallback - redirect to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
