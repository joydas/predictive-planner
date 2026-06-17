const notificationRepository = require('../repositories/notification.repository');

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
        const userId = project.ownerId || project.submittedByUserId || project.pm_id || project.created_by;

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
        const userId = cr.submittedByUserId || cr.pm_id || cr.created_by;

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
        return await this.createNotification({
            organization_id,
            user_id,
            notification_type: type,
            title,
            message,
            reference_type: 'MODEL',
            reference_id: null
        });
    }
}

module.exports = new NotificationService();
