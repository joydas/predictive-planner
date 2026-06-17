const { AsyncLocalStorage } = require('async_hooks');

/**
 * TenantContext provides a request-scoped store for the currently authenticated user's 
 * tenant information (organizationId, userId, role).
 * 
 * It uses Node's AsyncLocalStorage to ensure that the context is preserved across 
 * asynchronous calls within the same request.
 */
const storage = new AsyncLocalStorage();

const TenantContext = {
  /**
   * Initialize the context for a request.
   * @param {Object} context - The context data (e.g., { userId, organizationId, role })
   * @param {Function} callback - The logic to execute within this context
   */
  run(context, callback) {
    return storage.run(context, callback);
  },

  /**
   * Get the current context data.
   */
  get() {
    return storage.getStore() || {};
  },

  /**
   * Get the current user's ID.
   */
  getUserId() {
    return this.get().userId;
  },

  /**
   * Get the current organization's ID.
   */
  getOrganizationId() {
    const orgId = this.get().organizationId;
    if (!orgId) {
      // In a production multi-tenant app, we might want to throw if context is missing
      // console.warn('TenantContext: organizationId is missing in current context');
    }
    return orgId;
  },

  /**
   * Get the current user's role.
   */
  getRole() {
    return this.get().role;
  },
 
   setOrganizationId(organizationId) {
    const currentContext = this.get();
    if (currentContext) {
      currentContext.organizationId = organizationId;
    } else {
      // If there's no current context, we can choose to initialize it or log a warning
      // console.warn('TenantContext: No existing context found when trying to set organizationId');
    } 
    },

};

module.exports = TenantContext;
