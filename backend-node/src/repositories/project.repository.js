const { pool: db } = require('../config/db.config');

async function ensureDraftTable() {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS project_drafts (
      draft_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      owner_id BIGINT UNSIGNED NOT NULL,
      draft_data JSON NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (draft_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  await db.promise().query(createTableSql);
}

async function createDraft(ownerId, draftData, status = 'DRAFT') {
  await ensureDraftTable();
  const sql = `
    INSERT INTO project_drafts (owner_id, draft_data, status)
    VALUES (?, ?, ?)
  `;
  const [result] = await db.promise().query(sql, [ownerId, JSON.stringify(draftData), status]);
  return { draftId: result.insertId };
}

async function updateDraft(draftId, ownerId, draftData, status = 'DRAFT') {
  await ensureDraftTable();
  const sql = `
    UPDATE project_drafts
    SET draft_data = ?, updated_at = NOW(), status = ?
    WHERE draft_id = ? AND owner_id = ?
  `;
  const [result] = await db.promise().query(sql, [JSON.stringify(draftData), status, draftId, ownerId]);
  return result.affectedRows > 0;
}

async function getDraftById(draftId, ownerId) {
  await ensureDraftTable();
  const sql = `
    SELECT draft_id AS draftId,
           owner_id AS ownerId,
           draft_data AS draftData,
           status,
           created_at AS createdAt,
           updated_at AS updatedAt
    FROM project_drafts
    WHERE draft_id = ? AND owner_id = ?
    LIMIT 1
  `;
  const [rows] = await db.promise().query(sql, [draftId, ownerId]);
  return rows[0] || null;
}

async function markDraftSubmitted(draftId, ownerId) {
  await ensureDraftTable();
  const sql = `
    UPDATE project_drafts
    SET status = 'SUBMITTED', updated_at = NOW()
    WHERE draft_id = ? AND owner_id = ?
  `;
  const [result] = await db.promise().query(sql, [draftId, ownerId]);
  return result.affectedRows > 0;
}

function mapDraftDataToProject(row) {
  const draftData = row.draftData || {};
  const legacy = draftData._legacy || {};
  const basicInfo = draftData.basicInfo || {};

  return {
    projectId: row.projectId,
    ownerId: row.ownerId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    name: legacy.name || basicInfo.project_name || 'Untitled Project',
    business_unit: legacy.business_unit || basicInfo.client_name || 'Unknown Client',
    technology: legacy.technology || (draftData.technology || {}).technology_stack || 'Unknown',
    complexity: legacy.complexity || (draftData.technology || {}).complexity || 0,
    team_size: legacy.team_size || (draftData.financial || {}).estimated_team_size || 0,
    estimated_hours: legacy.estimated_hours || (draftData.financial || {}).planned_effort || 0,
    predicted_hours: draftData.predicted_hours || 0,
    avg_experience: legacy.avg_experience || 0,
    technology_score: legacy.technology_score || (draftData.technology || {}).integration_count || 0,
    draftData,
  };
}

async function findProjects() {
  await ensureDraftTable();
  const query = `
    SELECT draft_id AS projectId,
           owner_id AS ownerId,
           draft_data AS draftData,
           status,
           created_at AS createdAt,
           updated_at AS updatedAt
    FROM project_drafts
    WHERE status = 'SUBMITTED'
    ORDER BY updated_at DESC
  `;
  const [rows] = await db.promise().query(query);
  return rows.map(mapDraftDataToProject);
}

async function insertProject(projectRecord) {
  throw new Error('Legacy project insert is no longer available. Use draft submission instead.');
}

async function getSubmittedProjectById(projectId) {
  await ensureDraftTable();
  const query = `
    SELECT draft_id AS projectId,
           owner_id AS ownerId,
           draft_data AS draftData,
           status,
           created_at AS createdAt,
           updated_at AS updatedAt
    FROM project_drafts
    WHERE draft_id = ? AND status = 'SUBMITTED'
    LIMIT 1
  `;
  const [rows] = await db.promise().query(query, [projectId]);
  if (!rows.length) {
    return null;
  }
  return mapDraftDataToProject(rows[0]);
}

module.exports = {
  createDraft,
  updateDraft,
  getDraftById,
  markDraftSubmitted,
  findProjects,
  getSubmittedProjectById,
  insertProject,
};
