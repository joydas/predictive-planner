const { pool: db } = require('../config/db.config');

class NotificationRepository {
    async create(notificationData) {
        const { organization_id, user_id, notification_type, title, message, reference_type, reference_id } = notificationData;
        const query = `
            INSERT INTO notification (organization_id, user_id, notification_type, title, message, reference_type, reference_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.promise().query(query, [organization_id, user_id, notification_type, title, message, reference_type, reference_id]);
        return result.insertId;
    }

    async getNotifications(organization_id, user_id, limit = 50, offset = 0) {
        const query = `
            SELECT * FROM notification
            WHERE organization_id = ? AND user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;
        const [rows] = await db.promise().query(query, [organization_id, user_id, limit, offset]);
        return rows;
    }

    async getUnreadCount(organization_id, user_id) {
        const query = `
            SELECT COUNT(*) as unread_count FROM notification
            WHERE organization_id = ? AND user_id = ? AND is_read = FALSE
        `;
        const [rows] = await db.promise().query(query, [organization_id, user_id]);
        return rows[0].unread_count;
    }

    async markAsRead(notification_id, organization_id, user_id) {
        const query = `
            UPDATE notification
            SET is_read = TRUE
            WHERE notification_id = ? AND organization_id = ? AND user_id = ?
        `;
        const [result] = await db.promise().query(query, [notification_id, organization_id, user_id]);
        return result.affectedRows > 0;
    }

    async markAllAsRead(organization_id, user_id) {
        const query = `
            UPDATE notification
            SET is_read = TRUE
            WHERE organization_id = ? AND user_id = ? AND is_read = FALSE
        `;
        const [result] = await db.promise().query(query, [organization_id, user_id]);
        return result.affectedRows;
    }
}

module.exports = new NotificationRepository();
