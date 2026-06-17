const notificationService = require('../services/notification.service');

class NotificationController {
    async getNotifications(req, res) {
        try {
            const { organizationId, userId } = req.user;
            const { limit, offset } = req.query;
            const notifications = await notificationService.getNotifications(
                organizationId, 
                userId, 
                limit ? parseInt(limit) : 50, 
                offset ? parseInt(offset) : 0
            );
            res.json(notifications);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async getUnreadCount(req, res) {
        try {
            const { organizationId, userId } = req.user;
            const count = await notificationService.getUnreadCount(organizationId, userId);
            res.json({ unread_count: count });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async markAsRead(req, res) {
        try {
            const { organizationId, userId } = req.user;
            const { id } = req.params;
            await notificationService.markAsRead(id, organizationId, userId);
            res.json({ message: 'Notification marked as read' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    async markAllAsRead(req, res) {
        try {
            const { organizationId, userId } = req.user;
            await notificationService.markAllAsRead(organizationId, userId);
            res.json({ message: 'All notifications marked as read' });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new NotificationController();
