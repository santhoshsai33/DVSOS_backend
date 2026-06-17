const { apiResponse } = require('../../common/utils/apiResponse');

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const validateIdParam = (req, res, next) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'Valid service category id is required',
      data: {},
      meta: {}
    });
  }

  return next();
};

const validateCategoryPayload = (req, res, next) => {
  const { name } = req.body || {};

  if (!isNonEmptyString(name)) {
    return apiResponse(res, {
      statusCode: 400,
      success: false,
      message: 'category name is required',
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
  validateCategoryPayload,
  validateStatusPayload
};
