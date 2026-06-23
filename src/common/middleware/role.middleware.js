const { apiResponse } = require('../utils/apiResponse');

const normalizeAllowedRoles = (allowedRoles) => {
  if (Array.isArray(allowedRoles[0])) {
    return allowedRoles[0];
  }

  return allowedRoles;
};

const roleMiddleware = (allowedRoles = [], options = {}) => {
  const roles = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
    .map(r => r.toLowerCase().replace(/-/g, '_'));
  const allowAdmin = options.allowAdmin === true;

  return (req, res, next) => {
    const userRole = req.user && req.user.roleSlug && req.user.roleSlug.toLowerCase().replace(/-/g, '_');
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
