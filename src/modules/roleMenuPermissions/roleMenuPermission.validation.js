const { apiResponse } = require('../../common/utils/apiResponse');

const isPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0;
};

const sendValidationError = (res, message) => {
  return apiResponse(res, {
    statusCode: 400,
    success: false,
    message,
    data: {},
    meta: {}
  });
};

const validateRoleIdParam = (req, res, next) => {
  if (!isPositiveInt(Number(req.params.roleId))) {
    return sendValidationError(res, 'Valid role id is required');
  }

  return next();
};

const validateMenuIdParam = (req, res, next) => {
  if (!isPositiveInt(Number(req.params.menuId))) {
    return sendValidationError(res, 'Valid menu id is required');
  }

  return next();
};

const validatePermissionPayload = (req, res, next) => {
  const permissions = req.body;

  if (!Array.isArray(permissions) || permissions.length === 0) {
    return sendValidationError(res, 'permissions payload must be a non-empty array');
  }

  const menuIds = new Set();

  for (const permission of permissions) {
    if (!isPositiveInt(Number(permission.menuId))) {
      return sendValidationError(res, 'Each permission must include a valid menuId');
    }

    if (menuIds.has(Number(permission.menuId))) {
      return sendValidationError(res, 'Duplicate menuId values are not allowed');
    }

    menuIds.add(Number(permission.menuId));

    for (const field of ['canRead', 'canCreate', 'canUpdate', 'canDelete']) {
      if (typeof permission[field] !== 'boolean') {
        return sendValidationError(res, `${field} boolean is required for each permission`);
      }
    }
  }

  return next();
};

module.exports = {
  validateRoleIdParam,
  validateMenuIdParam,
  validatePermissionPayload
};
