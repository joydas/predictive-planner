import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  CButton,
  CContainer,
  CHeader,
  CHeaderNav,
  CNavItem,
  CNavLink,
  CSidebar,
  CSidebarBrand,
  CSidebarHeader,
  CSidebarNav,
  CTooltip,
} from '@coreui/react';
import {
  cilAccountLogout,
  cilFolderOpen,
  cilMenu,
  cilPlus,
  cilSpeedometer,
} from '@coreui/icons';
import CIcon from '@coreui/icons-react';
import authService from '../services/authService';

const SIDEBAR_EXPANDED_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 70;
const DESKTOP_BREAKPOINT = 768;
const SIDEBAR_STORAGE_KEY = 'layout.sidebarCollapsed';

const navigationItems = [
  { icon: cilSpeedometer, label: 'Dashboard', to: '/dashboard' },
  { icon: cilFolderOpen, label: 'Projects', to: '/projects' },
  { icon: cilPlus, label: 'Create Project', to: '/create-project' },
];

const getStoredSidebarCollapsed = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? 'false') === true;
  } catch {
    return false;
  }
};

const getIsDesktop = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }

  return window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`).matches;
};

const DefaultLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isDesktop, setIsDesktop] = useState(getIsDesktop);
  const [collapsed, setCollapsed] = useState(getStoredSidebarCollapsed);
  const [mobileSidebarVisible, setMobileSidebarVisible] = useState(false);

  const currentUser = authService.getCurrentUser();
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  const sidebarClassName = `app-sidebar border-end${collapsed ? ' collapsed' : ''}`;
  const layoutClassName = `app-layout ${isDesktop ? 'is-desktop' : 'is-mobile'}`;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const handleChange = (event) => {
      setIsDesktop(event.matches);

      if (event.matches) {
        setMobileSidebarVisible(false);
      }
    };

    setIsDesktop(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);

      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    mediaQuery.addListener(handleChange);

    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(collapsed));
    } catch {
      // Ignore storage failures and keep the in-memory state.
    }
  }, [collapsed]);

  useEffect(() => {
    if (!isDesktop) {
      setMobileSidebarVisible(false);
    }
  }, [isDesktop, location.pathname]);

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      authService.logout();
      navigate('/login');
    }
  };

  const handleSidebarToggle = () => {
    if (isDesktop) {
      setCollapsed((currentValue) => !currentValue);
      return;
    }

    setMobileSidebarVisible((currentValue) => !currentValue);
  };

  const handleSidebarHide = () => {
    if (!isDesktop) {
      setMobileSidebarVisible(false);
    }
  };

  const toggleLabel = isDesktop
    ? collapsed
      ? 'Expand sidebar'
      : 'Collapse sidebar'
    : mobileSidebarVisible
      ? 'Close sidebar'
      : 'Open sidebar';

  return (
    <div
      className={layoutClassName}
      style={{ '--app-sidebar-offset': isDesktop ? `${sidebarWidth}px` : '0px' }}
    >
      <CSidebar
        className={sidebarClassName}
        colorScheme="dark"
        overlaid={!isDesktop}
        placement="start"
        position="fixed"
        unfoldable={false}
        visible={!isDesktop ? mobileSidebarVisible : undefined}
        onHide={handleSidebarHide}
      >
        <CSidebarHeader className="border-bottom">
          <CSidebarBrand className="app-sidebar-brand">
            <span className="app-sidebar-brand-mark" aria-hidden="true">
              PP
            </span>
            <span className="app-sidebar-brand-text">Planner</span>
          </CSidebarBrand>
        </CSidebarHeader>

        <CSidebarNav>
          {navigationItems.map(({ icon, label, to }) => (
            <CNavItem key={to}>
              <CNavLink as={NavLink} className="app-sidebar-link" to={to}>
                <CIcon className="nav-icon app-sidebar-icon" icon={icon} />
                <span className="app-sidebar-label">{label}</span>
              </CNavLink>
            </CNavItem>
          ))}
        </CSidebarNav>
      </CSidebar>

      <div className="main-content-wrapper d-flex flex-column min-vh-100">
        <CHeader className="border-bottom sticky-top">
          <CContainer fluid>
            <CHeaderNav className="d-flex align-items-center me-auto">
              <CNavItem>
                <CTooltip content={toggleLabel}>
                  <CButton
                    aria-label={toggleLabel}
                    className="sidebar-toggle-btn"
                    color="light"
                    size="sm"
                    variant="ghost"
                    onClick={handleSidebarToggle}
                  >
                    <CIcon icon={cilMenu} size="sm" />
                  </CButton>
                </CTooltip>
              </CNavItem>

              <CNavItem className="welcome-message-item ms-2">
                <CNavLink className="welcome-message">
                  Welcome, <strong>{currentUser?.name || 'User'}</strong>
                </CNavLink>
              </CNavItem>
            </CHeaderNav>

            <CHeaderNav className="ms-auto">
              <CNavItem>
                <CTooltip content="Logout">
                  <CButton
                    color="secondary"
                    size="sm"
                    variant="outline"
                    onClick={handleLogout}
                  >
                    <CIcon icon={cilAccountLogout} size="sm" />
                  </CButton>
                </CTooltip>
              </CNavItem>
            </CHeaderNav>
          </CContainer>
        </CHeader>

        <div className="body flex-grow-1">
          <CContainer fluid>
            <Outlet />
          </CContainer>
        </div>
      </div>
    </div>
  );
};

export default DefaultLayout;
