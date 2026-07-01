const { apiResponse } = require('../utils/apiResponse');

const normalizeAllowedRoles = (allowedRoles) => {
  if (Array.isArray(allowedRoles[0])) {
    return allowedRoles[0];
  }

  return allowedRoles;
};

const ROLE_ALIASES = {
  super_admin: 'admin',
  body_shop: 'body_shop_supervisor',
  bodyshop: 'body_shop_supervisor',
  bodyshop_supervisor: 'body_shop_supervisor',
  floor: 'floor_supervisor',
  mechanical_supervisor: 'floor_supervisor',
  water_wash: 'water_wash_team',
  water_wash_supervisor: 'water_wash_team',
  wash: 'water_wash_team'
};

const normalizeRoleSlug = (roleSlug) => {
  const normalized = String(roleSlug || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  return ROLE_ALIASES[normalized] || normalized;
};

const roleMiddleware = (allowedRoles = [], options = {}) => {
  const roles = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
    .map(normalizeRoleSlug);
  const allowAdmin = options.allowAdmin === true;

  return (req, res, next) => {
    const userRole = normalizeRoleSlug(req.user && req.user.roleSlug);
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
