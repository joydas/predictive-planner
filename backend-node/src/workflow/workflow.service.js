const { pool } = require('../config/db.config');
const { normalizeRole, normalizeStatus, validateTransition } = require('./workflow.validator');

const ENTITY_CONFIG = {
  PROJECT: {
    tableName: 'project_drafts',
    idColumn: 'draft_id',
    historyTableName: 'project_workflow_history',
    historyEntityColumn: 'project_id',
  },
  CR: {
    tableName: 'change_request',
    idColumn: 'cr_id',
    historyTableName: 'cr_workflow_history',
    historyEntityColumn: 'cr_id',
  },
};

async function ensureWorkflowSchema(entityType) {
  const config = ENTITY_CONFIG[entityType];
  if (!config) {
    throw new Error(`Unsupported workflow entity: ${entityType}`);
  }
  return true;
}

async function getWorkflowEntity(connection, entityType, entityId) {
  const config = ENTITY_CONFIG[entityType];
  const [rows] = await connection.query(
    `
      SELECT ${config.idColumn} AS entityId,
             status,
             workflow_status AS workflowStatus
      FROM ${config.tableName}
      WHERE ${config.idColumn} = ?
      LIMIT 1
    `,
    [entityId],
  );

  return rows[0] || null;
}

function buildWorkflowUpdate(config, toStatus, actionType, userId, comment) {
  const fields = ['workflow_status = ?', 'status = ?', 'latest_comment = ?'];
  const values = [toStatus, toStatus, comment];

  if (actionType === 'SUBMIT' || actionType === 'RESUBMIT') {
    fields.push('submitted_by_user_id = ?', 'submitted_at = NOW()');
    values.push(userId);
  }

  if (actionType === 'APPROVE') {
    fields.push('approved_by_user_id = ?', 'approved_at = NOW()');
    values.push(userId);
  }

  return {
    sql: `UPDATE ${config.tableName} SET ${fields.join(', ')} WHERE ${config.idColumn} = ?`,
    values,
  };
}

async function transitionWorkflow({ entityType, entityId, user, actionType, comment }) {
  const config = ENTITY_CONFIG[entityType];
  if (!config) {
    const error = new Error('Unsupported workflow entity');
    error.status = 400;
    throw error;
  }

  const connection = await pool.promise().getConnection();
  try {
    await connection.beginTransaction();

    const entity = await getWorkflowEntity(connection, entityType, entityId);
    if (!entity) {
      const error = new Error(`${entityType === 'PROJECT' ? 'Project' : 'Change request'} not found`);
      error.status = 404;
      throw error;
    }

    const fromStatus = normalizeStatus(entity.workflowStatus || entity.status);
    const transition = validateTransition({
      fromStatus,
      actionType,
      role: user.role,
      comment,
    });

    const trimmedComment = String(comment).trim();
    const update = buildWorkflowUpdate(
      config,
      transition.toStatus,
      transition.actionType,
      user.userId,
      trimmedComment,
    );
    await connection.query(update.sql, [...update.values, entityId]);

    await connection.query(
      `
        INSERT INTO ${config.historyTableName}
          (${config.historyEntityColumn}, from_status, to_status, action_by_user_id, action_by_role, action_comment, action_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        entityId,
        fromStatus,
        transition.toStatus,
        user.userId,
        normalizeRole(user.role),
        trimmedComment,
        transition.actionType,
      ],
    );

    await connection.commit();

    return {
      entityId,
      fromStatus,
      toStatus: transition.toStatus,
      actionType: transition.actionType,
      latestComment: trimmedComment,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function transitionWorkflowInTransaction(connection, { entityType, entityId, user, actionType, comment }) {
  const config = ENTITY_CONFIG[entityType];
  if (!config) {
    const error = new Error('Unsupported workflow entity');
    error.status = 400;
    throw error;
  }

  const entity = await getWorkflowEntity(connection, entityType, entityId);
  if (!entity) {
    const error = new Error(`${entityType === 'PROJECT' ? 'Project' : 'Change request'} not found`);
    error.status = 404;
    throw error;
  }

  const fromStatus = normalizeStatus(entity.workflowStatus || entity.status);
  const transition = validateTransition({
    fromStatus,
    actionType,
    role: user.role,
    comment,
  });

  const trimmedComment = String(comment).trim();
  const update = buildWorkflowUpdate(
    config,
    transition.toStatus,
    transition.actionType,
    user.userId,
    trimmedComment,
  );
  await connection.query(update.sql, [...update.values, entityId]);

  await connection.query(
    `
      INSERT INTO ${config.historyTableName}
        (${config.historyEntityColumn}, from_status, to_status, action_by_user_id, action_by_role, action_comment, action_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      entityId,
      fromStatus,
      transition.toStatus,
      user.userId,
      normalizeRole(user.role),
      trimmedComment,
      transition.actionType,
    ],
  );

  return {
    entityId,
    fromStatus,
    toStatus: transition.toStatus,
    actionType: transition.actionType,
    latestComment: trimmedComment,
  };
}

async function getWorkflowHistory(entityType, entityId) {
  const config = ENTITY_CONFIG[entityType];
  if (!config) {
    const error = new Error('Unsupported workflow entity');
    error.status = 400;
    throw error;
  }

  const [rows] = await pool.promise().query(
    `
      SELECT h.workflow_history_id AS workflowHistoryId,
             h.${config.historyEntityColumn} AS entityId,
             h.from_status AS fromStatus,
             h.to_status AS toStatus,
             h.action_by_user_id AS actionByUserId,
             h.action_by_role AS actionByRole,
             h.action_comment AS actionComment,
             h.action_type AS actionType,
             h.created_at AS createdAt,
             u.user_name AS actorName
      FROM ${config.historyTableName} h
      LEFT JOIN app_user u ON u.user_id = h.action_by_user_id
      WHERE h.${config.historyEntityColumn} = ?
      ORDER BY h.created_at DESC, h.workflow_history_id DESC
    `,
    [entityId],
  );

  return rows;
}

module.exports = {
  ensureWorkflowSchema,
  getWorkflowHistory,
  transitionWorkflowInTransaction,
  transitionWorkflow,
};
