import React, { useEffect, useState, useCallback } from 'react';
import {
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
  CTable,
  CTableBody,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
  CButton,
  CBadge,
  CSpinner,
  CFormCheck,
} from '@coreui/react';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notificationService';
import { formatDisplayDateTime } from '../utils/dateUtils';
import { useNavigate } from 'react-router-dom';

const NotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const navigate = useNavigate();

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications({ limit: 100 });
      setNotifications(data);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (id) => {
    try {
      await markAsRead(id);
      setNotifications(notifications.map(n => n.notification_id === id ? { ...n, is_read: 1 } : n));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
        markAsRead(notification.notification_id);
    }
    
    if (notification.reference_type === 'PROJECT') {
        navigate(`/projects/view/${notification.reference_id}`);
    } else if (notification.reference_type === 'CR') {
        navigate(`/crs/view/${notification.reference_id}`);
    } else if (notification.reference_type === 'MODEL') {
        navigate('/admin/ml');
    }
  };

  const filteredNotifications = showUnreadOnly 
    ? notifications.filter(n => !n.is_read)
    : notifications;

  return (
    <div className="fade-in">
      <CRow className="mb-4">
        <CCol xs={12}>
          <div className="d-flex justify-content-between align-items-center">
            <h1 className="page-title">Notification Center</h1>
            <div className="d-flex gap-2 align-items-center">
              <CFormCheck 
                id="unreadOnly" 
                label="Unread only" 
                checked={showUnreadOnly}
                onChange={() => setShowUnreadOnly(!showUnreadOnly)}
              />
              <CButton color="primary" variant="outline" size="sm" onClick={handleMarkAllRead}>
                Mark All as Read
              </CButton>
            </div>
          </div>
        </CCol>
      </CRow>

      <CRow>
        <CCol xs={12}>
          <CCard className="mb-4">
            <CCardHeader>
              <strong>Your Notifications</strong>
            </CCardHeader>
            <CCardBody>
              {loading ? (
                <div className="text-center py-5">
                  <CSpinner />
                </div>
              ) : filteredNotifications.length > 0 ? (
                <div className="table-responsive">
                  <CTable hover align="middle" className="mb-0 border">
                    <CTableHead color="light">
                      <CTableRow>
                        <CTableHeaderCell style={{ width: '40px' }}></CTableHeaderCell>
                        <CTableHeaderCell>Title</CTableHeaderCell>
                        <CTableHeaderCell>Message</CTableHeaderCell>
                        <CTableHeaderCell>Date</CTableHeaderCell>
                        <CTableHeaderCell className="text-center">Action</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {filteredNotifications.map((n) => (
                        <CTableRow 
                            key={n.notification_id} 
                            active={!n.is_read}
                            className={n.is_read ? 'text-muted' : ''}
                        >
                          <CTableDataCell className="text-center">
                            {!n.is_read && <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#321fdb', margin: 'auto' }}></div>}
                          </CTableDataCell>
                          <CTableDataCell>
                            <div className="fw-bold" style={{ cursor: 'pointer' }} onClick={() => handleNotificationClick(n)}>{n.title}</div>
                          </CTableDataCell>
                          <CTableDataCell>
                            <div className="small">{n.message}</div>
                          </CTableDataCell>
                          <CTableDataCell>
                            <div className="small">{formatDisplayDateTime(n.created_at)}</div>
                          </CTableDataCell>
                          <CTableDataCell className="text-center">
                            {!n.is_read && (
                              <CButton color="primary" size="sm" onClick={() => handleMarkRead(n.notification_id)}>
                                Mark as Read
                              </CButton>
                            )}
                          </CTableDataCell>
                        </CTableRow>
                      ))}
                    </CTableBody>
                  </CTable>
                </div>
              ) : (
                <div className="text-center py-5 text-muted">
                  No notifications found.
                </div>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>
    </div>
  );
};

export default NotificationCenter;
