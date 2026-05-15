const projectRepository = require('../repositories/project.repository');

async function publishApprovedDraft(connection, draftId, approvedByUserId) {
  const draft = await projectRepository.getDraftForPublishing(connection, draftId);
  if (!draft) {
    const error = new Error('Project draft not found');
    error.status = 404;
    throw error;
  }

  if (String(draft.workflowStatus || '').toUpperCase() !== 'APPROVED') {
    const error = new Error('Only approved drafts can be published');
    error.status = 400;
    throw error;
  }

  if (draft.isPublished) {
    const error = new Error('Project draft is already published');
    error.status = 409;
    error.publishedProjectId = draft.publishedProjectId;
    throw error;
  }

  const projectId = await projectRepository.insertApprovedProject(connection, draft, approvedByUserId);
  await projectRepository.insertProjectTeamSnapshots(
    connection,
    projectId,
    draft.draftData?.teamComposition?.rows || [],
  );

  const marked = await projectRepository.markDraftPublished(connection, draftId, projectId);
  if (!marked) {
    const error = new Error('Project draft is already published');
    error.status = 409;
    throw error;
  }

  return { projectId, draftId };
}

module.exports = {
  publishApprovedDraft,
};
