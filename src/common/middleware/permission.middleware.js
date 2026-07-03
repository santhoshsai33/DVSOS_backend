const prisma = require('../../config/db');
const { apiResponse } = require('../utils/apiResponse');

const normalizeRoleSlug = (roleSlug) => String(roleSlug || '').trim().toLowerCase().replace(/-/g, '_');

const hasModule = (user, module) => {
  return Boolean(user && Array.isArray(user.modules) && user.modules.includes(module));
};

const permissionMiddleware = (menuPathOrOptions, actionArg = 'canRead') => {
  const options = typeof menuPathOrOptions === 'object'
    ? menuPathOrOptions || {}
    : { menuPath: menuPathOrOptions, action: actionArg };
  const { menuPath, action = 'canRead' } = options;

  return async (req, res, next) => {
    try {
      if (!menuPath || !req.user || !req.user.roleId) {
        return next();
      }

      if (hasModule(req.user, 'admin') || ['admin', 'super_admin'].includes(normalizeRoleSlug(req.user.roleSlug))) {
        return next();
      }

      const permission = await prisma.roleMenuPermission.findFirst({
        where: {
          roleId: req.user.roleId,
          menu: {
            path: menuPath,
            isActive: true
          },
          [action]: true
        },
        select: { id: true }
      });

      if (!permission) {
        return apiResponse(res, {
          statusCode: 403,
          success: false,
          message: 'You do not have permission to perform this action',
          data: {},
          meta: {}
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

module.exports = {
  permissionMiddleware
};
