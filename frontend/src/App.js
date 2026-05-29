import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DefaultLayout from './layouts/DefaultLayout';
import Dashboard from './pages/Dashboard';
import ProjectDetails from './pages/ProjectDetails';
import CreateProjectPage from './pages/project/CreateProjectPage';
import CompleteProjectPage from './pages/project/CompleteProjectPage';
import ProjectListPage from './pages/project/ProjectListPage';
import CRListPage from './pages/cr/CRListPage';
import CreateCRPage from './pages/cr/CreateCRPage';
import CRDetailsPage from './pages/cr/CRDetailsPage';
import UserManagementPage from './pages/admin/UserManagementPage';
import MlAdministrationPage from './pages/admin/MlAdministrationPage';
import AnalyticsOverview from './pages/analytics/AnalyticsOverview';
import PMDashboard from './pages/analytics/PMDashboard';
import AMDashboard from './pages/analytics/AMDashboard';
import ProjectProgress from './pages/ProjectProgress';
import ChangeRequest from './pages/ChangeRequest';
import TeamRecommendation from './pages/TeamRecommendation';
import ResourceListPage from './pages/resource/ResourceListPage';
import ResourceAllocationPage from './pages/resource/ResourceAllocationPage';
import ResourceUtilizationPage from './pages/resource/ResourceUtilizationPage';
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
          <Route path="projects" element={<ProjectListPage />} />
          <Route path="projects/create" element={<CreateProjectPage />} />
          <Route path="projects/edit/:draftId" element={<CreateProjectPage />} />
          <Route path="projects/complete/:projectId" element={<CompleteProjectPage />} />
          <Route path="projects/view/:projectId" element={<ProjectDetails />} />
          <Route path="projects/:projectId" element={<ProjectDetails />} />
          <Route path="crs" element={<CRListPage />} />
          <Route path="crs/create" element={<CreateCRPage />} />
          <Route path="crs/:crId" element={<CRDetailsPage />} />
          <Route path="admin/users" element={<UserManagementPage />} />
          <Route path="admin/ml" element={<MlAdministrationPage />} />
          <Route path="analytics" element={<AnalyticsOverview />} />
          <Route path="analytics/pm" element={<PMDashboard />} />
          <Route path="analytics/am" element={<AMDashboard />} />
          <Route path="resources" element={<ResourceListPage />} />
          <Route path="resources/allocations" element={<ResourceAllocationPage />} />
          <Route path="resources/utilization" element={<ResourceUtilizationPage />} />
          <Route path="create-project" element={<CreateProjectPage />} />
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
