import React, { useEffect, useState, useCallback } from 'react';
import {
  CDropdown,
  CDropdownToggle,
  CDropdownMenu,
  CDropdownItem,
  CBadge,
  CDropdownHeader,
  CDropdownDivider,
  CSpinner,
} from '@coreui/react';
import { cilBell } from '@coreui/icons';
import CIcon from '@coreui/icons-react';
import { useNavigate } from 'react-router-dom';
import { getUnreadCount, getNotifications, markAsRead } from '../services/notificationService';

const NotificationBell = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await getUnreadCount();
      setUnreadCount(data.unread_count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  }, []);

  const fetchLatestNotifications = async () => {
    setLoading(true);
    try {
      const data = await getNotifications({ limit: 5 });
      setNotifications(data);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const handleMarkRead = async (id, e) => {
    e.stopPropagation();
    try {
      await markAsRead(id);
      fetchUnreadCount();
      setNotifications(notifications.map(n => n.notification_id === id ? { ...n, is_read: 1 } : n));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
        markAsRead(notification.notification_id).then(() => fetchUnreadCount());
    }
    
    if (notification.reference_type === 'PROJECT') {
        navigate(`/projects/view/${notification.reference_id}`);
    } else if (notification.reference_type === 'CR') {
        navigate(`/crs/view/${notification.reference_id}`); // Assuming CR view exists
    } else if (notification.reference_type === 'MODEL') {
        navigate('/admin/ml');
    }
  };

  return (
    <CDropdown variant="nav-item" alignment="end" onShow={fetchLatestNotifications}>
      <CDropdownToggle caret={false} className="py-0 px-2">
        <CIcon icon={cilBell} size="lg" />
        {unreadCount > 0 && (
          <CBadge color="danger" position="top-end" shape="rounded-pill">
            {unreadCount > 99 ? '99+' : unreadCount}
          </CBadge>
        )}
      </CDropdownToggle>
      <CDropdownMenu className="pt-0" style={{ width: '300px', zIndex: 3000 }}>
        <CDropdownHeader className="bg-light fw-semibold py-2">
          Notifications
        </CDropdownHeader>
        {loading ? (
          <div className="text-center py-3">
            <CSpinner size="sm" />
          </div>
        ) : notifications.length > 0 ? (
          <>
            {notifications.map((n) => (
              <CDropdownItem 
                key={n.notification_id} 
                onClick={() => handleNotificationClick(n)}
                className={n.is_read ? 'text-muted' : 'fw-bold'}
              >
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <div className="small text-truncate" style={{ maxWidth: '200px' }}>{n.title}</div>
                    <div className="x-small text-muted text-truncate" style={{ maxWidth: '200px', fontSize: '0.75rem' }}>{n.message}</div>
                  </div>
                  {!n.is_read && (
                    <CBadge 
                        color="primary" 
                        shape="rounded-pill" 
                        size="sm" 
                        onClick={(e) => handleMarkRead(n.notification_id, e)}
                        style={{ cursor: 'pointer' }}
                    >
                        ●
                    </CBadge>
                  )}
                </div>
              </CDropdownItem>
            ))}
            <CDropdownDivider />
            <CDropdownItem onClick={() => navigate('/notifications')} className="text-center small text-primary">
              View All Notifications
            </CDropdownItem>
          </>
        ) : (
          <CDropdownItem disabled>No notifications</CDropdownItem>
        )}
      </CDropdownMenu>
    </CDropdown>
  );
};

export default NotificationBell;
