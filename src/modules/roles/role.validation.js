const { apiResponse } = require('../../common/utils/apiResponse');

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isSlug = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || '').trim());

const validateIdParam = (req, res, next) => {
  const identifier = req.params.id;
  const id = Number(identifier);

  if ((!Number.isInteger(id) || id <= 0) && !isSlug(identifier)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'Valid role identifier is required',
      data: {},
      meta: {}
    });
  }

  return next();
};

const validateRolePayload = (req, res, next) => {
  const { name } = req.body || {};

  if (!isNonEmptyString(name)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'role name is required',
      data: {},
      meta: {}
    });
  }

  return next();
};

const validateStatusPayload = (req, res, next) => {
  if (typeof (req.body || {}).isActive !== 'boolean') {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'isActive boolean is required',
      data: {},
      meta: {}
    });
  }

  return next();
};

module.exports = {
  validateIdParam,
  validateRolePayload,
  validateStatusPayload
};
