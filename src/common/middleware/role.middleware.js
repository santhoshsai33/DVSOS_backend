const { apiResponse } = require('../utils/apiResponse');

const normalizeAllowedRoles = (allowedRoles) => {
  if (Array.isArray(allowedRoles[0])) {
    return allowedRoles[0];
  }

  return allowedRoles;
};

const roleMiddleware = (allowedRoles = [], options = {}) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  const allowAdmin = options.allowAdmin !== false;

  return (req, res, next) => {
    const userRole = req.user && req.user.roleSlug;
    const canAccess = roles.includes(userRole) || (allowAdmin && userRole === 'admin');

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
