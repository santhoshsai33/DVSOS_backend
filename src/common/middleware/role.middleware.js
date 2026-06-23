const { apiResponse } = require('../utils/apiResponse');

const normalizeAllowedRoles = (allowedRoles) => {
  if (Array.isArray(allowedRoles[0])) {
    return allowedRoles[0];
  }

  return allowedRoles;
};

const normalizeRoleSlug = (roleSlug) => String(roleSlug || '').trim().toLowerCase().replace(/-/g, '_');

const roleMiddleware = (allowedRoles = [], options = {}) => {
  const roles = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]).map(normalizeRoleSlug);
  const allowAdmin = options.allowAdmin === true;

  return (req, res, next) => {
    const userRole = normalizeRoleSlug(req.user && req.user.roleSlug);
    const canAccess = roles.includes(userRole) || (allowAdmin && ['admin', 'super_admin'].includes(userRole));

    if (!userRole || !canAccess) {
      return apiResponse(res, {
        statusCode: 403,
        success: false,
        message: 'You do not have permission to access this resource',
        data: {},
        meta: {}
      });
    }

    return next();
  };
};

const authorizeRoles = (...allowedRoles) => {
  return roleMiddleware(normalizeAllowedRoles(allowedRoles));
};

module.exports = {
  roleMiddleware,
  authorizeRoles
};
