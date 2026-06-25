const notificationRepository = require('../repositories/notification.repository');
const userRepository = require('../repositories/user.repository');

class NotificationService {
    async createNotification(notificationData) {
        return await notificationRepository.create(notificationData);
    }

    async getNotifications(organization_id, user_id, limit = 50, offset = 0) {
        return await notificationRepository.getNotifications(organization_id, user_id, limit, offset);
    }

    async getUnreadCount(organization_id, user_id) {
        return await notificationRepository.getUnreadCount(organization_id, user_id);
    }

    async markAsRead(notification_id, organization_id, user_id) {
        return await notificationRepository.markAsRead(notification_id, organization_id, user_id);
    }

    async markAllAsRead(organization_id, user_id) {
        return await notificationRepository.markAllAsRead(organization_id, user_id);
    }

    async notifyProjectUpdate(project, type, title, message) {
        const organizationId = project.organizationId || project.organization_id;
        let userId = project.ownerId || project.submittedByUserId || project.pm_id || project.created_by;

        if (type === 'PROJECT_SUBMITTED') {
            userId = project.ownerManagerId || project.submittedByManagerId || userId;
        }

        if (!organizationId || !userId) {
            console.error('Missing mandatory notification fields for project update:', { organizationId, userId, projectId: project.projectId });
            return;
        }

        return await this.createNotification({
            organization_id: organizationId,
            user_id: userId,
            notification_type: type,
            title,
            message,
            reference_type: 'PROJECT',
            reference_id: project.projectId
        });
    }

    async notifyCrUpdate(cr, type, title, message) {
        const organizationId = cr.organizationId || cr.organization_id;
        let userId = cr.submittedByUserId || cr.pm_id || cr.created_by;

        if (type === 'CR_SUBMITTED') {
            userId = cr.submittedByManagerId || cr.managerId || userId;
        }

        if (!organizationId || !userId) {
            console.error('Missing mandatory notification fields for CR update:', { organizationId, userId, crId: cr.crId });
            return;
        }

        return await this.createNotification({
            organization_id: organizationId,
            user_id: userId,
            notification_type: type,
            title,
            message,
            reference_type: 'CR',
            reference_id: cr.crId
        });
    }

    async notifyModelEvent(organization_id, user_id, type, title, message) {
        try {
            let users = [];
            if (organization_id) {
                users = await userRepository.listUsers(organization_id);
            } else {
                const { pool } = require('../config/db.config');
                const [rows] = await pool.promise().query('SELECT user_id AS userId, organization_id AS organizationId FROM app_user WHERE active_flag = 1 AND role_name != \'SUPER_ADMIN\'');
                users = rows;
            }
            const promises = users.map(u => this.createNotification({
                organization_id: u.organizationId !== undefined ? u.organizationId : organization_id,
                user_id: u.userId,
                notification_type: type,
                title,
                message,
                reference_type: 'MODEL',
                reference_id: null
            }));
            return await Promise.allSettled(promises);
        } catch (err) {
            console.error('Failed to notify all users of model event:', err);
        }
    }
}

module.exports = new NotificationService();
